const driverBadge = document.getElementById('driverBadge');
const setupDriver = document.getElementById('setupDriver');
const driverPicker = document.getElementById('driverPicker');
const bindDriverBtn = document.getElementById('bindDriverBtn');
const invoiceNumberInput = document.getElementById('invoiceNumber');
const paymentMethodSelect = document.getElementById('paymentMethod');
const captureBtn = document.getElementById('captureBtn');
const switchBtn = document.getElementById('switchBtn');
const submitBtn = document.getElementById('submitBtn');
const syncBtn = document.getElementById('syncBtn');
const video = document.getElementById('cameraPreview');
const canvas = document.getElementById('canvas');
const imagePreview = document.getElementById('capturedImage');
const statusEl = document.getElementById('status');
const queueCount = document.getElementById('queueCount');
const connectionState = document.getElementById('connectionState');

let stream;
let currentFacingMode = 'environment';
let drivers = [];
let pendingQueue = [];
let capturedDataUrl = '';
let boundDriverId = localStorage.getItem('pod-device-driver') || '';
let settings = null;

function applyTheme(theme) {
  const root = document.documentElement;
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--panel', theme.panel);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent-2', theme.accent2);
  root.style.setProperty('--text', theme.text);
  root.style.setProperty('--muted', theme.muted);
  root.style.setProperty('--border', theme.border);
  root.style.setProperty('--form-bg', theme.formBg);
  root.style.setProperty('--form-text', theme.formText);
  root.style.setProperty('--secondary-button-bg', theme.secondaryButtonBg);
}

function applyUiSettings(ui) {
  document.getElementById('appTitle').textContent = ui.appTitle;
  document.getElementById('subtitle').textContent = ui.subtitle;
  document.getElementById('badgeText').textContent = ui.badgeText;
  document.getElementById('driverLabel').textContent = ui.driverLabel;
  document.getElementById('driverBindLabel').textContent = ui.driverBindLabel;
  document.getElementById('invoiceLabel').textContent = ui.invoiceLabel;
  document.getElementById('paymentLabel').textContent = ui.paymentLabel;
  invoiceNumberInput.placeholder = ui.invoicePlaceholder;
  bindDriverBtn.textContent = ui.driverBindButton;
  captureBtn.textContent = ui.captureButton;
  switchBtn.textContent = ui.switchButton;
  submitBtn.textContent = ui.saveQueueButton;
  syncBtn.textContent = ui.syncNowButton;
  statusEl.textContent = ui.statusReadyText;
}

function applyPaymentOptions(form) {
  paymentMethodSelect.innerHTML = '';
  form.paymentOptions.forEach(optionValue => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    paymentMethodSelect.appendChild(option);
  });
}

async function loadSettings() {
  const response = await fetch('/settings/app_settings.json');
  settings = await response.json();
  applyTheme(settings.theme);
  applyUiSettings(settings.ui);
  applyPaymentOptions(settings.form);
}

function getBoundDriver() {
  return drivers.find(driver => driver.id === boundDriverId) || null;
}

function renderDriverOptions() {
  driverPicker.innerHTML = '';
  drivers.forEach(driver => {
    const option = document.createElement('option');
    option.value = driver.id;
    option.textContent = driver.name;
    driverPicker.appendChild(option);
  });

  if (boundDriverId && drivers.some(driver => driver.id === boundDriverId)) {
    driverPicker.value = boundDriverId;
  }
}

function renderDriverState() {
  const boundDriver = getBoundDriver();
  if (boundDriver) {
    driverBadge.textContent = boundDriver.name;
    setupDriver.classList.add('hidden');
  } else {
    driverBadge.textContent = settings?.ui?.notLinkedLabel || 'Not linked yet';
    setupDriver.classList.remove('hidden');
  }
}

function loadDrivers() {
  return fetch('/api/drivers')
    .then(res => res.json())
    .then(items => {
      drivers = items;
      renderDriverOptions();
      renderDriverState();
    })
    .catch(() => {
      drivers = [{ id: 'driver-001', name: 'Ava', folder: 'Ava' }];
      renderDriverOptions();
      renderDriverState();
    });
}

function bindDriverToDevice() {
  const selectedDriverId = driverPicker.value;
  if (!selectedDriverId) {
    statusEl.textContent = 'Select a driver before locking this device.';
    return;
  }

  if (boundDriverId) {
    statusEl.textContent = 'This device is already linked to a driver.';
    return;
  }

  boundDriverId = selectedDriverId;
  localStorage.setItem('pod-device-driver', selectedDriverId);
  renderDriverState();
  const boundDriver = getBoundDriver();
  statusEl.textContent = `Device linked to ${boundDriver ? boundDriver.name : 'driver'}.`;
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
  connectionState.textContent = online
    ? (settings?.ui?.connectionOnline || 'Online')
    : (settings?.ui?.connectionOffline || 'Offline');
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

function refreshQueueCount() {
  const queueLabel = settings?.ui?.queueLabel || 'pending';
  queueCount.textContent = `${pendingQueue.length} ${queueLabel}`;
}

function loadQueue() {
  const raw = localStorage.getItem('pod-queue');
  pendingQueue = raw ? JSON.parse(raw) : [];
  refreshQueueCount();
}

function saveQueue() {
  localStorage.setItem('pod-queue', JSON.stringify(pendingQueue));
  refreshQueueCount();
}

function enqueueEntry() {
  const selectedDriver = getBoundDriver();
  if (!selectedDriver) {
    statusEl.textContent = 'Link this device to a driver first.';
    return;
  }

  if (!capturedDataUrl || !invoiceNumberInput.value.trim()) {
    statusEl.textContent = 'Capture an invoice and add an invoice number before saving.';
    return;
  }

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
  paymentMethodSelect.value = settings.form.paymentOptions[0];
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
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
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

captureBtn.addEventListener('click', captureInvoice);
switchBtn.addEventListener('click', async () => {
  currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
  await startCamera();
});
bindDriverBtn.addEventListener('click', bindDriverToDevice);
submitBtn.addEventListener('click', enqueueEntry);
syncBtn.addEventListener('click', syncQueue);
window.addEventListener('online', () => { toggleConnectionStatus(); syncQueue(); });
window.addEventListener('offline', toggleConnectionStatus);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  toggleConnectionStatus();
  loadQueue();
  await loadDrivers();
  await startCamera();
  await syncQueue();
});
