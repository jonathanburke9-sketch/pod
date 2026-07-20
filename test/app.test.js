const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');

let server;

test('server serves the app and driver data', async () => {
  server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise(resolve => setTimeout(resolve, 700));

  const res = await fetch('http://127.0.0.1:3000/api/drivers');
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 1);

  server.kill('SIGTERM');
});

test('server exposes storage health status', async () => {
  server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise(resolve => setTimeout(resolve, 700));

  const res = await fetch('http://127.0.0.1:3000/api/health/storage');
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(typeof body.supabaseConfigured, 'boolean');
  assert.equal(typeof body.oneDriveConfigured, 'boolean');
  assert.equal(typeof body.oneDriveRootExists, 'boolean');
  assert.ok(Array.isArray(body.drivers));
  assert.ok(body.drivers.length >= 1);
  assert.equal(typeof body.drivers[0].folderExists, 'boolean');

  server.kill('SIGTERM');
});
