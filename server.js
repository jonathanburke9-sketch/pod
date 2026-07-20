require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';
const publicDir = path.join(__dirname, 'public');
const dataDir = path.join(__dirname, 'data');
const settingsDir = path.join(__dirname, 'settings');
const submissionsFile = path.join(dataDir, 'submissions.json');
const driversFile = path.join(dataDir, 'drivers.json');
const adminKey = process.env.ADMIN_KEY || '';
const hasSupabaseConfig = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const oneDriveRoot = process.env.ONEDRIVE_ROOT || '';
const oneDrivePodRoot = process.env.ONEDRIVE_POD_ROOT || 'POD_Uploads';

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

function ensureDataFiles() {
  fs.mkdirSync(dataDir, { recursive: true });
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

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const maxBodySize = 25 * 1024 * 1024;
    let bodySize = 0;
    let body = '';

    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > maxBodySize) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
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

  const { error } = await supabase
    .from('pod_submissions')
    .insert(row);

  if (error) {
    throw error;
  }

  return true;
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

  return readJsonFile(driversFile, fallbackDrivers);
}

async function getStorageHealth() {
  const drivers = await getDriversWithFallback();
  const oneDriveRootExists = Boolean(oneDriveRoot) && fs.existsSync(oneDriveRoot);

  return {
    ok: true,
    supabaseConfigured: hasSupabaseConfig,
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
  if (!oneDriveRoot) {
    return { saved: false, reason: 'ONEDRIVE_ROOT is not configured' };
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

  const absoluteDir = path.join(oneDriveRoot, oneDrivePodRoot, folderSegment, timeParts.year, timeParts.month);
  fs.mkdirSync(absoluteDir, { recursive: true });

  const absoluteFilePath = path.join(absoluteDir, fileName);
  fs.writeFileSync(absoluteFilePath, pdfBuffer);

  const relativePath = [
    oneDrivePodRoot,
    folderSegment,
    timeParts.year,
    timeParts.month,
    fileName
  ].join('/');

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
      const statusCode = error.message === 'Payload too large' ? 413 : 400;
      sendJson(res, statusCode, {
        error: error.message === 'Payload too large'
          ? 'Upload payload too large. Capture fewer pages or try lower resolution.'
          : 'Invalid JSON payload'
      });
      return;
    }

    const drivers = await getDriversWithFallback();
    const matchedDriver = drivers.find(driver => driver.id === payload.driverId);
    const mappedFolder = (matchedDriver && matchedDriver.folder)
      || payload.folder
      || payload.driverFolder
      || payload.driverName
      || 'Unmapped';

    payload.folder = mappedFolder;

    let oneDrive = { saved: false, reason: 'Not attempted' };
    try {
      oneDrive = writePdfToOneDrive(payload, mappedFolder);
      if (oneDrive.saved) {
        payload.podPdfPath = oneDrive.relativePath;
      }
    } catch (error) {
      oneDrive = { saved: false, reason: error.message || 'OneDrive write failed' };
      console.error('OneDrive mapping write failed.', oneDrive.reason);
    }

    let storage = 'local';
    if (supabase) {
      try {
        await writeSubmissionToSupabase(payload);
        storage = 'supabase';
      } catch (error) {
        console.error('Supabase upload failed. Falling back to local file queue.', error.message);
      }
    }

    if (storage !== 'supabase') {
      const existing = readJsonFile(submissionsFile, []);
      existing.push(payload);
      fs.writeFileSync(submissionsFile, JSON.stringify(existing, null, 2));
      storage = 'local';
    }

    sendJson(res, 200, {
      ok: true,
      storage,
      oneDrive
    });
    return;
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
