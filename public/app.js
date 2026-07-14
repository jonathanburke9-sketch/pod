const driverSelect = document.getElementById('driver');
const invoiceNumberInput = document.getElementById('invoiceNumber');
const paymentMethodSelect = document.getElementById('paymentMethod');
const captureBtn = document.getElementById('captureBtn');
const switchBtn = document.getElementById('switchBtn');
const submitBtn = document.getElementById('submitBtn');
const adminBtn = document.getElementById('adminBtn');
const addDriverBtn = document.getElementById('addDriverBtn');
const removeDriverBtn = document.getElementById('removeDriverBtn');
const driverNameInput = document.getElementById('driverName');
const video = document.getElementById('cameraPreview');
const canvas = document.getElementById('canvas');
const imagePreview = document.getElementById('capturedImage');
const statusEl = document.getElementById('status');
const queueCount = document.getElementById('queueCount');
const connectionState = document.getElementById('connectionState');
const adminPanel = document.getElementById('adminPanel');

let stream;
let currentFacingMode = 'environment';
let drivers = [];
let pendingQueue = [];
let capturedDataUrl = '';

function loadDrivers() {
  fetch('/api/drivers')
    .then(res => res.json())
    .then(items => {
      drivers = items;
      renderDrivers();
    })
    .catch(() => {
      drivers = [{ id: 'driver-001', name: 'Ava', folder: 'Ava' }];
      renderDrivers();
    });
}

function renderDrivers() {
  driverSelect.innerHTML = '';
  drivers.forEach(driver => {
    const option = document.createElement('option');
    option.value = driver.id;
    option.textContent = driver.name;
    driverSelect.appendChild(option);
  });

  const savedDriverId = localStorage.getItem('pod-device-driver');
  const fallback = drivers[0]?.id;
  const selected = savedDriverId && drivers.some(driver => driver.id === savedDriverId) ? savedDriverId : fallback;
  if (selected) {
    driverSelect.value = selected;
  }
}

function rememberDriverSelection() {
  if (driverSelect.value) {
    localStorage.setItem('pod-device-driver', driverSelect.value);
  }
}

async function startCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode }, audio: false });
    video.srcObject = stream;
    await video.play();
    statusEl.textContent = 'Camera ready. Frame the invoice and capture.';
  } catch (error) {
    statusEl.textContent = 'Camera access is blocked. Please allow camera access.';
  }
}

function toggleConnectionStatus() {
  const online = navigator.onLine;
  connectionState.textContent = online ? 'Online' : 'Offline';
}

function applyEdgeDetection() {
  const context = canvas.getContext('2d');
  canvas.width = video.videoWidth || 1200;
  canvas.height = video.videoHeight || 800;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const threshold = gray > 140 ? 255 : 0;
    data[i] = threshold;
    data[i + 1] = threshold;
    data[i + 2] = threshold;
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.92);
}

function captureInvoice() {
  capturedDataUrl = applyEdgeDetection();
  imagePreview.src = capturedDataUrl;
  imagePreview.classList.remove('hidden');
  statusEl.textContent = 'Invoice captured. Review and save it to the queue.';
}

function fileNameFromEntry(entry) {
  const d = new Date(entry.timestamp);
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  return `${entry.invoiceNumber}-${stamp}-${entry.driverName}-${entry.paymentMethod}`.replace(/\s+/g, '-');
}

function loadQueue() {
  const raw = localStorage.getItem('pod-queue');
  pendingQueue = raw ? JSON.parse(raw) : [];
  queueCount.textContent = `${pendingQueue.length} pending`;
}

function saveQueue() {
  localStorage.setItem('pod-queue', JSON.stringify(pendingQueue));
  queueCount.textContent = `${pendingQueue.length} pending`;
}

function enqueueEntry() {
  if (!capturedDataUrl || !invoiceNumberInput.value.trim()) {
    statusEl.textContent = 'Capture an invoice and add an invoice number before saving.';
    return;
  }

  const selectedDriver = drivers.find(driver => driver.id === driverSelect.value) || drivers[0];
  const entry = {
    id: `${Date.now()}`,
    driverId: selectedDriver.id,
    driverName: selectedDriver.name,
    folder: selectedDriver.folder || selectedDriver.name,
    invoiceNumber: invoiceNumberInput.value.trim(),
    paymentMethod: paymentMethodSelect.value,
    imageData: capturedDataUrl,
    timestamp: new Date().toISOString(),
    filename: ''
  };
  entry.filename = fileNameFromEntry(entry);
  pendingQueue.push(entry);
  saveQueue();
  statusEl.textContent = `Saved offline as ${entry.filename}`;
  invoiceNumberInput.value = '';
  paymentMethodSelect.value = 'Cash';
  imagePreview.classList.add('hidden');
  capturedDataUrl = '';
}

async function syncQueue() {
  if (!navigator.onLine) {
    statusEl.textContent = 'Offline. New deliveries remain safe in the queue.';
    return;
  }

  if (!pendingQueue.length) {
    statusEl.textContent = 'Queue is empty.';
    return;
  }

  const remaining = [];
  for (const item of pendingQueue) {
    try {
      const payload = { ...item, imageData: item.imageData };
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('sync failed');
    } catch (error) {
      remaining.push(item);
    }
  }

  pendingQueue = remaining;
  saveQueue();
  statusEl.textContent = pendingQueue.length ? 'Some items need another sync attempt.' : 'All deliveries uploaded.';
}

function toggleAdmin() {
  adminPanel.classList.toggle('hidden');
}

async function addDriver() {
  const name = driverNameInput.value.trim();
  if (!name) return;
  const nextDrivers = [...drivers, { id: `driver-${Date.now()}`, name, folder: name }];
  drivers = nextDrivers;
  renderDrivers();
  await fetch('/api/drivers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nextDrivers)
  });
  driverNameInput.value = '';
  statusEl.textContent = `${name} was added to the driver list.`;
}

async function removeDriver() {
  const selectedId = driverSelect.value;
  if (!selectedId) return;
  const nextDrivers = drivers.filter(driver => driver.id !== selectedId);
  drivers = nextDrivers;
  renderDrivers();
  await fetch('/api/drivers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nextDrivers)
  });
  statusEl.textContent = 'Selected driver removed.';
}

captureBtn.addEventListener('click', captureInvoice);
switchBtn.addEventListener('click', async () => {
  currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
  await startCamera();
});
driverSelect.addEventListener('change', rememberDriverSelection);
submitBtn.addEventListener('click', enqueueEntry);
adminBtn.addEventListener('click', toggleAdmin);
addDriverBtn.addEventListener('click', addDriver);
removeDriverBtn.addEventListener('click', removeDriver);
window.addEventListener('online', () => { toggleConnectionStatus(); syncQueue(); });
window.addEventListener('offline', toggleConnectionStatus);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  toggleConnectionStatus();
  loadDrivers();
  loadQueue();
  await startCamera();
  await syncQueue();
});
