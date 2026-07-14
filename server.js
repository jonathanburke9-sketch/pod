const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const dataDir = path.join(__dirname, 'data');
const submissionsFile = path.join(dataDir, 'submissions.json');

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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/drivers') {
    const filePath = path.join(__dirname, 'data', 'drivers.json');
    fs.readFile(filePath, 'utf8', (err, content) => {
      if (err) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify([{ id: 'driver-001', name: 'Ava', folder: 'Ava' }]));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(content);
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/drivers') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const filePath = path.join(__dirname, 'data', 'drivers.json');
      const next = JSON.parse(body);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(next));
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/upload') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const payload = JSON.parse(body);
      const existing = JSON.parse(fs.readFileSync(submissionsFile, 'utf8'));
      existing.push(payload);
      fs.writeFileSync(submissionsFile, JSON.stringify(existing, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.join(publicDir, requested);
  sendFile(res, filePath);
});

server.listen(port, () => {
  console.log(`POD app running on http://localhost:${port}`);
});
