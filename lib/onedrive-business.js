const tenantId = process.env.MS_TENANT_ID || '';
const clientId = process.env.MS_CLIENT_ID || '';
const clientSecret = process.env.MS_CLIENT_SECRET || '';
const driveId = process.env.ONEDRIVE_DRIVE_ID || '';
const rootPath = process.env.ONEDRIVE_POD_ROOT === undefined
  ? 'POD_Uploads'
  : process.env.ONEDRIVE_POD_ROOT;

function getMissingConfig() {
  const missing = [];
  if (!tenantId) missing.push('MS_TENANT_ID');
  if (!clientId) missing.push('MS_CLIENT_ID');
  if (!clientSecret) missing.push('MS_CLIENT_SECRET');
  if (!driveId) missing.push('ONEDRIVE_DRIVE_ID');
  return missing;
}

function isConfigured() {
  return getMissingConfig().length === 0;
}

function getUnavailableReason() {
  const missing = getMissingConfig();
  return missing.length
    ? `Business OneDrive sync is not configured. Missing: ${missing.join(', ')}`
    : '';
}

function normalizeRemotePath(relativePath) {
  const cleanRelative = String(relativePath || '')
    .split('/')
    .filter(Boolean)
    .join('/');

  return [rootPath, cleanRelative]
    .filter(Boolean)
    .join('/');
}

async function getAccessToken() {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default'
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Microsoft token request failed (${response.status}): ${text || 'Unknown error'}`);
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error('Microsoft token response did not include an access token.');
  }

  return payload.access_token;
}

async function uploadBuffer(relativePath, fileBuffer) {
  const unavailableReason = getUnavailableReason();
  if (unavailableReason) {
    throw new Error(unavailableReason);
  }

  const remotePath = normalizeRemotePath(relativePath)
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
  const accessToken = await getAccessToken();
  const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${remotePath}:/content`;

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/pdf'
    },
    body: fileBuffer
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Business OneDrive upload failed (${response.status}): ${text || 'Unknown error'}`);
  }

  const payload = await response.json();
  return {
    id: payload.id || '',
    name: payload.name || '',
    webUrl: payload.webUrl || '',
    remotePath: normalizeRemotePath(relativePath)
  };
}

module.exports = {
  getUnavailableReason,
  isConfigured,
  normalizeRemotePath,
  uploadBuffer
};