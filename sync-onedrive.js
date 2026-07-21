require('dotenv').config();

const fs = require('fs');
const path = require('path');

const supabase = require('./lib/supabase');

const oneDriveRoot = process.env.ONEDRIVE_ROOT || '';
const oneDrivePodRoot = process.env.ONEDRIVE_POD_ROOT === undefined
  ? 'POD_Uploads'
  : process.env.ONEDRIVE_POD_ROOT;
const batchSize = Math.max(1, Number(process.env.SYNC_BATCH_SIZE || '25'));
const pollIntervalMs = Math.max(5000, Number(process.env.SYNC_INTERVAL_MS || '30000'));
const watchMode = process.argv.includes('--watch');

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
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}

function buildTimestampParts(isoTimestamp) {
  const date = isoTimestamp ? new Date(isoTimestamp) : new Date();
  const parsed = Number.isNaN(date.getTime()) ? new Date() : date;
  return {
    year: String(parsed.getUTCFullYear()),
    month: String(parsed.getUTCMonth() + 1).padStart(2, '0'),
    stamp: `${parsed.getUTCFullYear()}${String(parsed.getUTCMonth() + 1).padStart(2, '0')}${String(parsed.getUTCDate()).padStart(2, '0')}-${String(parsed.getUTCHours()).padStart(2, '0')}${String(parsed.getUTCMinutes()).padStart(2, '0')}${String(parsed.getUTCSeconds()).padStart(2, '0')}`
  };
}

function dataUrlPdfToBuffer(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:application/pdf;base64,')) {
    return null;
  }

  const base64 = dataUrl.split(',')[1] || '';
  return base64 ? Buffer.from(base64, 'base64') : null;
}

function ensureWritableOneDriveRoot() {
  if (!oneDriveRoot) {
    throw new Error('ONEDRIVE_ROOT is not configured. Set it to your local OneDrive folder path.');
  }

  if (process.platform !== 'win32' && /^[a-zA-Z]:\\/.test(oneDriveRoot)) {
    throw new Error('ONEDRIVE_ROOT is a Windows path, but this worker is not running on Windows.');
  }

  fs.mkdirSync(oneDriveRoot, { recursive: true });
}

function normalizePayload(row) {
  const payload = row && typeof row.payload === 'string'
    ? JSON.parse(row.payload)
    : (row?.payload || {});

  return {
    rowId: row.id,
    payload,
    mappedFolder: row.driver_folder || payload.folder || payload.driverFolder || payload.driverName || row.driver_name || 'Unmapped',
    invoiceNumber: row.invoice_number || payload.invoiceNumber || 'INV-unknown',
    timestamp: payload.timestamp || row.synced_at || new Date().toISOString(),
    fileName: payload.filename || '',
    imageData: payload.imageData || ''
  };
}

function buildFileDestination(normalized) {
  const pdfBuffer = dataUrlPdfToBuffer(normalized.imageData);
  if (!pdfBuffer) {
    throw new Error('Submission payload does not contain a PDF data URL.');
  }

  const folderSegment = safePathSegment(normalized.mappedFolder);
  const invoiceSegment = safePathSegment(normalized.invoiceNumber);
  const timeParts = buildTimestampParts(normalized.timestamp);
  const fallbackFileName = `${invoiceSegment}_${timeParts.stamp}.pdf`;
  const fileName = sanitizeFileName(normalized.fileName || fallbackFileName);

  const pathSegments = [oneDriveRoot];
  if (oneDrivePodRoot) {
    pathSegments.push(oneDrivePodRoot);
  }
  pathSegments.push(folderSegment, timeParts.year, timeParts.month);

  const absoluteDir = path.join(...pathSegments);
  const absoluteFilePath = path.join(absoluteDir, fileName);
  const relativePath = [oneDrivePodRoot, folderSegment, timeParts.year, timeParts.month, fileName]
    .filter(Boolean)
    .join('/');

  return { pdfBuffer, absoluteDir, absoluteFilePath, relativePath };
}

async function fetchPendingRows() {
  const { data, error } = await supabase
    .from('pod_submissions')
    .select('id, driver_name, driver_folder, invoice_number, pod_pdf_url, payload, synced_at')
    .is('pod_pdf_url', null)
    .order('synced_at', { ascending: true })
    .limit(batchSize);

  if (error) {
    throw error;
  }

  return data || [];
}

async function markRowMirrored(rowId, relativePath) {
  const { error } = await supabase
    .from('pod_submissions')
    .update({
      pod_pdf_url: relativePath,
      status: 'mirrored',
      synced_at: new Date().toISOString()
    })
    .eq('id', rowId);

  if (error) {
    throw error;
  }
}

async function mirrorRow(row) {
  const normalized = normalizePayload(row);
  const destination = buildFileDestination(normalized);
  fs.mkdirSync(destination.absoluteDir, { recursive: true });
  fs.writeFileSync(destination.absoluteFilePath, destination.pdfBuffer);
  await markRowMirrored(normalized.rowId, destination.relativePath);
  return destination.relativePath;
}

async function runOnce() {
  ensureWritableOneDriveRoot();

  const rows = await fetchPendingRows();
  if (!rows.length) {
    console.log('No pending Supabase submissions to mirror.');
    return 0;
  }

  let mirroredCount = 0;
  for (const row of rows) {
    try {
      const relativePath = await mirrorRow(row);
      mirroredCount += 1;
      console.log(`Mirrored ${row.invoice_number || row.id} -> ${relativePath}`);
    } catch (error) {
      console.error(`Failed to mirror row ${row.id}: ${error.message}`);
    }
  }

  console.log(`Mirrored ${mirroredCount} of ${rows.length} pending submissions.`);
  return mirroredCount;
}

async function main() {
  do {
    try {
      await runOnce();
    } catch (error) {
      console.error(`Worker failed: ${error.message}`);
    }

    if (!watchMode) {
      return;
    }

    console.log(`Waiting ${pollIntervalMs}ms before next sync pass...`);
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  } while (watchMode);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});