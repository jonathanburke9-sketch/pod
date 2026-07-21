require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';
const publicDir = path.join(__dirname, 'public');
const packagedDataDir = path.join(__dirname, 'data');
const runtimeDataDir = resolveWritableDataDir(
  packagedDataDir,
  process.env.DATA_DIR || path.join(os.tmpdir(), 'pod-data')
);
const settingsDir = path.join(__dirname, 'settings');
const submissionsFile = path.join(runtimeDataDir, 'submissions.json');
const driversFile = path.join(packagedDataDir, 'drivers.json');
const adminKey = process.env.ADMIN_KEY || '';
const hasSupabaseConfig = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const oneDriveRoot = process.env.ONEDRIVE_ROOT || '';
const oneDrivePodRoot = process.env.ONEDRIVE_POD_ROOT === undefined
  ? 'POD_Uploads'
  : process.env.ONEDRIVE_POD_ROOT;
const uploadMirrorMode = process.env.UPLOAD_MIRROR_MODE || (process.env.VERCEL ? 'worker' : 'filesystem');

let supabase = null;
if (hasSupabaseConfig) {
  try {
    supabase = require('./lib/supabase');
  } catch (error) {
    console.error('Supabase initialization failed. Falling back to local storage.', error.message);
  }
}

const fallbackDrivers = [
  { id: 'driver-001', name: 'Jonathan (Admin)', folder: 'Jonathan-Admin' },
  { id: 'driver-002', name: 'Deon', folder: 'Deon' },
  { id: 'driver-003', name: 'Themba', folder: 'Themba' },
  { id: 'driver-004', name: 'Janine', folder: 'Janine' },
  { id: 'driver-005', name: 'Wilna', folder: 'Wilna' }
];

function canWriteToDirectory(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    const probeFile = path.join(dirPath, `.write-test-${process.pid}-${Date.now()}`);
    fs.writeFileSync(probeFile, 'ok');
    fs.unlinkSync(probeFile);
    return true;
  } catch (error) {
    return false;
  }
}

function resolveWritableDataDir(primaryDir, fallbackDir) {
  if (canWriteToDirectory(primaryDir)) {
    return primaryDir;
  }

  if (fallbackDir && canWriteToDirectory(fallbackDir)) {
    console.warn(`Primary data directory is read-only. Using runtime fallback at ${fallbackDir}`);
    return fallbackDir;
  }

  return primaryDir;
}

function ensureDataFiles() {
  fs.mkdirSync(runtimeDataDir, { recursive: true });
  if (!fs.existsSync(submissionsFile)) {
    fs.writeFileSync(submissionsFile, '[]');
  }
}

ensureDataFiles();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJsonFile(filePath, fallbackValue) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallbackValue;
  }
}

function readJsonArrayFile(filePath) {
  const value = readJsonFile(filePath, []);
  return Array.isArray(value) ? value : [];
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const configuredMaxMb = Number(process.env.UPLOAD_MAX_MB || '50');
    const maxBodySize = (Number.isFinite(configuredMaxMb) && configuredMaxMb > 0 ? configuredMaxMb : 50) * 1024 * 1024;
    let bodySize = 0;
    let body = '';
    let tooLarge = false;

    req.on('data', chunk => {
      if (tooLarge) return;
      bodySize += chunk.length;
      if (bodySize > maxBodySize) {
        tooLarge = true;
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      if (tooLarge) {
        reject(new Error(`Payload too large (max ${Math.round(maxBodySize / (1024 * 1024))}MB)`));
        return;
      }

      try {
        const parsed = JSON.parse(body || '{}');
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', error => reject(error));
  });
}

function isAuthorizedAdmin(req) {
  if (!adminKey) return false;
  return req.headers['x-admin-key'] === adminKey;
}

async function getDriversFromSupabase() {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('drivers')
    .select('id, name, folder, active')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(driver => ({
    id: driver.id,
    name: driver.name,
    folder: driver.folder
  }));
}

async function upsertDriversToSupabase(drivers) {
  if (!supabase) return;

  const records = drivers.map(driver => ({
    id: driver.id,
    name: driver.name,
    folder: driver.folder,
    active: true
  }));

  const { error } = await supabase
    .from('drivers')
    .upsert(records, { onConflict: 'id' });

  if (error) {
    throw error;
  }
}

async function writeSubmissionToSupabase(payload) {
  if (!supabase) return false;

  const row = {
    driver_id: payload.driverId || null,
    driver_name: payload.driverName || '',
    driver_folder: payload.folder || payload.driverFolder || '',
    invoice_number: payload.invoiceNumber || '',
    payment_method: payload.paymentMethod || null,
    notes: payload.notes || null,
    pod_pdf_url: payload.podPdfPath || null,
    status: 'uploaded',
    source_device: payload.sourceDevice || null,
    payload,
    synced_at: new Date().toISOString()
  };

  const timeoutMs = Number(process.env.SUPABASE_TIMEOUT_MS || '8000');
  const insertPromise = supabase
    .from('pod_submissions')
    .insert(row);

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Supabase timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  const { error } = await Promise.race([insertPromise, timeoutPromise]);

  if (error) {
    throw error;
  }

  return true;
}

function isSupabaseInvocationFailure(error) {
  const message = String(error?.message || '').toUpperCase();
  const code = String(error?.code || '').toUpperCase();
  return message.includes('FUNCTION_INVOCATION_FAILED') || code.includes('FUNCTION_INVOCATION_FAILED');
}

async function getDriversWithFallback() {
  try {
    const supabaseDrivers = await getDriversFromSupabase();
    if (supabaseDrivers && supabaseDrivers.length) {
      return supabaseDrivers;
    }
  } catch (error) {
    console.error('Failed to read drivers from Supabase. Using local fallback.', error.message);
  }

  const localDrivers = readJsonFile(driversFile, fallbackDrivers);
  return Array.isArray(localDrivers) ? localDrivers : fallbackDrivers;
}

async function getStorageHealth() {
  const drivers = await getDriversWithFallback();
  const oneDriveRootExists = Boolean(oneDriveRoot) && fs.existsSync(oneDriveRoot);

  return {
    ok: true,
    supabaseConfigured: hasSupabaseConfig,
    uploadMirrorMode,
    oneDriveConfigured: Boolean(oneDriveRoot),
    oneDriveRootExists,
    oneDrivePodRoot,
    drivers: drivers.map(driver => {
      const folderName = safePathSegment(driver.folder || driver.name || driver.id);
      const folderPath = oneDriveRoot
        ? path.join(oneDriveRoot, oneDrivePodRoot, folderName)
        : '';

      return {
        id: driver.id,
        name: driver.name,
        folder: driver.folder,
        folderExists: Boolean(folderPath) && fs.existsSync(folderPath)
      };
    })
  };
}

function safePathSegment(value) {
  const text = String(value || '').trim();
  if (!text) return 'unknown';
  return text
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .trim();
}

function sanitizeFileName(value) {
  const cleaned = safePathSegment(value || 'pod-document.pdf');
  if (cleaned.toLowerCase().endsWith('.pdf')) return cleaned;
  return `${cleaned}.pdf`;
}

function getOneDriveUnavailableReason() {
  if (!oneDriveRoot) {
    return 'ONEDRIVE_ROOT is not configured';
  }

  const isWindowsDrivePath = /^[a-zA-Z]:\\/.test(oneDriveRoot);
  if (process.env.VERCEL) {
    return 'Filesystem OneDrive writes are not supported on Vercel. This deployment can upload to Supabase, but not to your local PC folder.';
  }

  if (isWindowsDrivePath && process.platform !== 'win32') {
    return 'ONEDRIVE_ROOT points to a Windows folder, but this server is not running on Windows.';
  }

  return '';
}

function appendSubmissionLocally(payload) {
  const existing = readJsonArrayFile(submissionsFile);
  existing.push(payload);
  fs.writeFileSync(submissionsFile, JSON.stringify(existing, null, 2));
}

function dataUrlPdfToBuffer(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:application/pdf;base64,')) {
    return null;
  }

  const base64 = dataUrl.split(',')[1] || '';
  if (!base64) return null;
  return Buffer.from(base64, 'base64');
}

function buildTimestampParts(isoTimestamp) {
  const date = isoTimestamp ? new Date(isoTimestamp) : new Date();
  const isValid = !Number.isNaN(date.getTime());
  const d = isValid ? date : new Date();
  const year = String(d.getUTCFullYear());
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const stamp = `${year}${month}${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}`;
  return { year, month, stamp };
}

function writePdfToOneDrive(payload, mappedFolder) {
  const unavailableReason = getOneDriveUnavailableReason();
  if (unavailableReason) {
    return { saved: false, reason: unavailableReason };
  }

  const pdfBuffer = dataUrlPdfToBuffer(payload.imageData);
  if (!pdfBuffer) {
    return { saved: false, reason: 'No PDF data URL was provided in payload.imageData' };
  }

  const folderSegment = safePathSegment(mappedFolder || payload.folder || payload.driverName || 'Unmapped');
  const invoiceSegment = safePathSegment(payload.invoiceNumber || 'INV-unknown');
  const timeParts = buildTimestampParts(payload.timestamp);
  const fallbackFileName = `${invoiceSegment}_${timeParts.stamp}.pdf`;
  const fileName = sanitizeFileName(payload.filename || fallbackFileName);

  const pathSegments = [oneDriveRoot];
  if (oneDrivePodRoot) {
    pathSegments.push(oneDrivePodRoot);
  }
  pathSegments.push(folderSegment, timeParts.year, timeParts.month);
  const absoluteDir = path.join(...pathSegments);
  fs.mkdirSync(absoluteDir, { recursive: true });

  const absoluteFilePath = path.join(absoluteDir, fileName);
  fs.writeFileSync(absoluteFilePath, pdfBuffer);

  const relativePath = [oneDrivePodRoot, folderSegment, timeParts.year, timeParts.month, fileName]
    .filter(Boolean)
    .join('/');

  return {
    saved: true,
    relativePath,
    absoluteFilePath
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/drivers') {
    const drivers = await getDriversWithFallback();

    sendJson(res, 200, drivers);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health/storage') {
    const health = await getStorageHealth();
    sendJson(res, 200, health);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/drivers') {
    if (!isAuthorizedAdmin(req)) {
      sendJson(res, 403, { error: 'Admin access required' });
      return;
    }

    let payload;
    try {
      payload = await parseJsonBody(req);
    } catch (error) {
      sendJson(res, 400, { error: 'Expected an array of driver objects' });
      return;
    }

    if (!Array.isArray(payload)) {
      sendJson(res, 400, { error: 'Expected an array of driver objects' });
      return;
    }

    const sanitized = payload.map((driver, index) => ({
      id: (driver && typeof driver.id === 'string' && driver.id.trim()) || `driver-${Date.now()}-${index}`,
      name: (driver && typeof driver.name === 'string' && driver.name.trim()) || `Driver ${index + 1}`,
      folder: (driver && typeof driver.folder === 'string' && driver.folder.trim())
        || ((driver && typeof driver.name === 'string' && driver.name.trim()) || `Driver-${index + 1}`)
    }));

    fs.mkdirSync(path.dirname(driversFile), { recursive: true });
    fs.writeFileSync(driversFile, JSON.stringify(sanitized, null, 2));

    if (supabase) {
      try {
        await upsertDriversToSupabase(sanitized);
      } catch (error) {
        console.error('Failed to upsert drivers to Supabase. Local copy saved.', error.message);
      }
    }

    sendJson(res, 200, sanitized);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/upload') {
    let payload;
    try {
      payload = await parseJsonBody(req);
    } catch (error) {
      const tooLarge = error.message && error.message.toLowerCase().startsWith('payload too large');
      const statusCode = tooLarge ? 413 : 400;
      sendJson(res, statusCode, {
        error: tooLarge
          ? `${error.message}. Capture fewer pages or try lower resolution.`
          : 'Invalid JSON payload'
      });
      return;
    }

    try {
      const drivers = await getDriversWithFallback();
      const matchedDriver = Array.isArray(drivers)
        ? drivers.find(driver => driver.id === payload.driverId)
        : null;
      const mappedFolder = (matchedDriver && matchedDriver.folder)
        || payload.folder
        || payload.driverFolder
        || payload.driverName
        || 'Unmapped';

      payload.folder = mappedFolder;

      let oneDrive = uploadMirrorMode === 'worker'
        ? { saved: false, pending: true, reason: 'Queued for sync worker' }
        : { saved: false, reason: 'Not attempted' };
      if (uploadMirrorMode !== 'worker') {
        try {
          oneDrive = writePdfToOneDrive(payload, mappedFolder);
          if (oneDrive.saved) {
            payload.podPdfPath = oneDrive.relativePath;
          }
        } catch (error) {
          oneDrive = { saved: false, reason: error.message || 'OneDrive write failed' };
          console.error('OneDrive mapping write failed.', oneDrive.reason);
        }
      }

      let storage = 'local';
      let warning = '';
      if (supabase) {
        try {
          await writeSubmissionToSupabase(payload);
          storage = 'supabase';
        } catch (error) {
          warning = isSupabaseInvocationFailure(error)
            ? 'Supabase function failed, saved locally instead.'
            : 'Supabase unavailable, saved locally instead.';
          console.error('Supabase upload failed. Falling back to local file queue.', error.message);
        }
      }

      if (!oneDrive.saved && !oneDrive.pending && oneDrive.reason) {
        warning = warning
          ? `${warning} OneDrive copy failed: ${oneDrive.reason}`
          : `OneDrive copy failed: ${oneDrive.reason}`;
      }

      if (storage !== 'supabase') {
        appendSubmissionLocally(payload);
        storage = 'local';
      }

      sendJson(res, 200, {
        ok: true,
        storage,
        oneDrive,
        warning
      });
      return;
    } catch (error) {
      console.error('Upload pipeline failed.', error.message);
      sendJson(res, 500, { error: `Upload pipeline failed on server: ${error.message}` });
      return;
    }
  }

  if (req.method === 'GET' && url.pathname.startsWith('/settings/')) {
    const relativePath = url.pathname.replace(/^\/settings\//, '');
    const filePath = path.join(settingsDir, relativePath);
    sendFile(res, filePath);
    return;
  }

  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.join(publicDir, requested);
  sendFile(res, filePath);
});

server.listen(port, host, () => {
  const networkInterfaces = os.networkInterfaces();
  const lanAddress = Object.values(networkInterfaces)
    .flat()
    .find(net => net && net.family === 'IPv4' && !net.internal)?.address;

  console.log(`POD app running on http://localhost:${port}`);
  if (lanAddress) {
    console.log(`LAN access: http://${lanAddress}:${port}`);
  }
});
