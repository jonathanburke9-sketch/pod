const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const dataDir = path.join(__dirname, 'data');
const settingsDir = path.join(__dirname, 'settings');
const submissionsFile = path.join(dataDir, 'submissions.json');
const driversFile = path.join(dataDir, 'drivers.json');
const adminKey = process.env.ADMIN_KEY || '';

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

function parseJsonBody(req, callback) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body || '{}');
      callback(null, parsed);
    } catch (error) {
      callback(error);
    }
  });
}

function isAuthorizedAdmin(req) {
  if (!adminKey) return false;
  return req.headers['x-admin-key'] === adminKey;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/drivers') {
    const drivers = readJsonFile(driversFile, [{ id: 'driver-001', name: 'Ava', folder: 'Ava' }]);
    sendJson(res, 200, drivers);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/drivers') {
    if (!isAuthorizedAdmin(req)) {
      sendJson(res, 403, { error: 'Admin access required' });
      return;
    }

    parseJsonBody(req, (error, payload) => {
      if (error || !Array.isArray(payload)) {
        sendJson(res, 400, { error: 'Expected an array of driver objects' });
        return;
      }

      fs.mkdirSync(path.dirname(driversFile), { recursive: true });
      fs.writeFileSync(driversFile, JSON.stringify(payload, null, 2));
      sendJson(res, 200, payload);
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/upload') {
    parseJsonBody(req, (error, payload) => {
      if (error) {
        sendJson(res, 400, { error: 'Invalid JSON payload' });
        return;
      }

      const existing = JSON.parse(fs.readFileSync(submissionsFile, 'utf8'));
      existing.push(payload);
      fs.writeFileSync(submissionsFile, JSON.stringify(existing, null, 2));
      sendJson(res, 200, { ok: true });
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

server.listen(port, () => {
  console.log(`POD app running on http://localhost:${port}`);
});
