const driverBadge = document.getElementById('driverBadge');
const setupDriver = document.getElementById('setupDriver');
const driverPicker = document.getElementById('driverPicker');
const bindDriverBtn = document.getElementById('bindDriverBtn');
const invoiceNumberInput = document.getElementById('invoiceNumber');
const invoiceHint = document.getElementById('invoiceHint');
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
const healthTitle = document.getElementById('healthTitle');
const healthPendingLabel = document.getElementById('healthPendingLabel');
const healthLastSyncLabel = document.getElementById('healthLastSyncLabel');
const healthFailedLabel = document.getElementById('healthFailedLabel');
const healthPendingValue = document.getElementById('healthPendingValue');
const healthLastSyncValue = document.getElementById('healthLastSyncValue');
const healthFailedValue = document.getElementById('healthFailedValue');

let stream;
let currentFacingMode = 'environment';
let drivers = [];
let pendingQueue = [];
let capturedDataUrl = '';
let captureQualityWarnings = [];
let boundDriverId = localStorage.getItem('pod-device-driver') || '';
let settings = null;
let invoiceRegex = /^INV-\d{4}$/i;
let health = {
  failedUploads: 0,
  lastSyncAt: ''
};

function getActiveTheme(settingsObj) {
  const presetKey = settingsObj.activeThemePreset;
  const preset = settingsObj.themePresets && settingsObj.themePresets[presetKey];
  if (preset) return preset;
  return settingsObj.theme || settingsObj.themePresets?.ocean || {};
}

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
  invoiceHint.textContent = ui.invoicePatternHint || 'Format: INV-####';
  invoiceNumberInput.placeholder = ui.invoicePlaceholder;
  bindDriverBtn.textContent = ui.driverBindButton;
  captureBtn.textContent = ui.captureButton;
  switchBtn.textContent = ui.switchButton;
  submitBtn.textContent = ui.saveQueueButton;
  syncBtn.textContent = ui.syncNowButton;
  statusEl.textContent = ui.statusReadyText;
  healthTitle.textContent = ui.healthTitle || 'Upload Health';
  healthPendingLabel.textContent = ui.healthPendingLabel || 'Pending';
  healthLastSyncLabel.textContent = ui.healthLastSyncLabel || 'Last Sync';
  healthFailedLabel.textContent = ui.healthFailedLabel || 'Failed Uploads';
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

function setupValidation(form) {
  try {
    invoiceRegex = new RegExp(form.invoicePattern || '^INV-\\d{4}$', form.invoicePatternFlags || 'i');
  } catch (error) {
    invoiceRegex = /^INV-\d{4}$/i;
  }
}

function loadHealth() {
  const raw = localStorage.getItem('pod-health');
  health = raw ? JSON.parse(raw) : { failedUploads: 0, lastSyncAt: '' };
}

function saveHealth() {
  localStorage.setItem('pod-health', JSON.stringify(health));
}

function formatSyncTime(isoText) {
  if (!isoText) return settings?.ui?.healthNeverLabel || 'Never';
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return settings?.ui?.healthNeverLabel || 'Never';
  return date.toLocaleString();
}

function refreshHealthPanel() {
  healthPendingValue.textContent = String(pendingQueue.length);
  healthFailedValue.textContent = String(health.failedUploads || 0);
  healthLastSyncValue.textContent = formatSyncTime(health.lastSyncAt || '');
}

async function loadSettings() {
  const response = await fetch('/settings/app_settings.json');
  settings = await response.json();
  applyTheme(getActiveTheme(settings));
  applyUiSettings(settings.ui);
  applyPaymentOptions(settings.form);
  setupValidation(settings.form);
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
    statusEl.textContent = 'Camera ready. Frame the invoice in the corner guides and capture.';
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

function computeBrightnessAndSharpness(imageData) {
  const { data, width, height } = imageData;
  let brightnessSum = 0;
  let edgeDiffSum = 0;
  let edgeSamples = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      brightnessSum += gray;

      if (x < width - 1) {
        const j = (y * width + (x + 1)) * 4;
        const grayRight = (data[j] + data[j + 1] + data[j + 2]) / 3;
        edgeDiffSum += Math.abs(gray - grayRight);
        edgeSamples += 1;
      }
      if (y < height - 1) {
        const k = ((y + 1) * width + x) * 4;
        const grayDown = (data[k] + data[k + 1] + data[k + 2]) / 3;
        edgeDiffSum += Math.abs(gray - grayDown);
        edgeSamples += 1;
      }
    }
  }

  const pixels = width * height;
  const averageBrightness = pixels ? brightnessSum / pixels : 0;
  const sharpnessScore = edgeSamples ? edgeDiffSum / edgeSamples : 0;
  return { averageBrightness, sharpnessScore };
}

function evaluateImageQuality(imageData) {
  const result = [];
  const metrics = computeBrightnessAndSharpness(imageData);
  const minBrightness = settings?.form?.minBrightness ?? 55;
  const maxBrightness = settings?.form?.maxBrightness ?? 220;
  const minSharpness = settings?.form?.minSharpness ?? 12;

  if (metrics.averageBrightness < minBrightness) {
    result.push('Image is dark. Try better light before saving.');
  }
  if (metrics.averageBrightness > maxBrightness) {
    result.push('Image is too bright. Avoid glare on the invoice.');
  }
  if (metrics.sharpnessScore < minSharpness) {
    result.push('Image may be blurry. Hold steady and recapture if possible.');
  }

  return result;
}

function applyEdgeDetectionFromCurrentFrame() {
  const context = canvas.getContext('2d');
  canvas.width = video.videoWidth || 1200;
  canvas.height = video.videoHeight || 800;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const originalImageData = context.getImageData(0, 0, canvas.width, canvas.height);
  captureQualityWarnings = evaluateImageQuality(originalImageData);

  const data = originalImageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const threshold = gray > 140 ? 255 : 0;
    data[i] = threshold;
    data[i + 1] = threshold;
    data[i + 2] = threshold;
  }

  context.putImageData(originalImageData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.92);
}

function captureInvoice() {
  capturedDataUrl = applyEdgeDetectionFromCurrentFrame();
  imagePreview.src = capturedDataUrl;
  imagePreview.classList.remove('hidden');
  if (captureQualityWarnings.length) {
    statusEl.textContent = `Invoice captured with warning: ${captureQualityWarnings.join(' ')}`;
  } else {
    statusEl.textContent = 'Invoice captured. Review and save it to the queue.';
  }
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
  refreshHealthPanel();
}

function saveQueue() {
  localStorage.setItem('pod-queue', JSON.stringify(pendingQueue));
  refreshQueueCount();
  refreshHealthPanel();
}

function isInvoiceValid(invoiceNumber) {
  return invoiceRegex.test(invoiceNumber);
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

  const invoiceNumber = invoiceNumberInput.value.trim().toUpperCase();
  if (!isInvoiceValid(invoiceNumber)) {
    statusEl.textContent = `Invoice number must match ${settings?.ui?.invoicePatternHint || 'INV-####'}.`;
    return;
  }

  const entry = {
    id: `${Date.now()}`,
    driverId: selectedDriver.id,
    driverName: selectedDriver.name,
    folder: selectedDriver.folder || selectedDriver.name,
    invoiceNumber,
    paymentMethod: paymentMethodSelect.value,
    imageData: capturedDataUrl,
    qualityWarnings: captureQualityWarnings,
    timestamp: new Date().toISOString(),
    filename: ''
  };
  entry.filename = fileNameFromEntry(entry);
  pendingQueue.push(entry);
  saveQueue();

  if (captureQualityWarnings.length) {
    statusEl.textContent = `Saved with image warning. ${captureQualityWarnings.join(' ')} File: ${entry.filename}`;
  } else {
    statusEl.textContent = `Saved offline as ${entry.filename}`;
  }

  invoiceNumberInput.value = '';
  paymentMethodSelect.value = settings.form.paymentOptions[0];
  imagePreview.classList.add('hidden');
  capturedDataUrl = '';
  captureQualityWarnings = [];
}

async function syncQueue() {
  if (!navigator.onLine) {
    statusEl.textContent = 'Offline. New deliveries remain safe in the queue.';
    refreshHealthPanel();
    return;
  }

  if (!pendingQueue.length) {
    health.lastSyncAt = new Date().toISOString();
    saveHealth();
    refreshHealthPanel();
    statusEl.textContent = 'Queue is empty.';
    return;
  }

  const remaining = [];
  let failedThisRun = 0;

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
      failedThisRun += 1;
    }
  }

  pendingQueue = remaining;
  health.failedUploads = (health.failedUploads || 0) + failedThisRun;
  health.lastSyncAt = new Date().toISOString();
  saveHealth();
  saveQueue();

  statusEl.textContent = pendingQueue.length
    ? 'Some items need another sync attempt.'
    : 'All deliveries uploaded.';
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
  loadHealth();
  toggleConnectionStatus();
  loadQueue();
  refreshHealthPanel();
  await loadDrivers();
  await startCamera();
  await syncQueue();
});
