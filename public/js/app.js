const driverBadge = document.getElementById('driverBadge');
const setupDriver = document.getElementById('setupDriver');
const driverPicker = document.getElementById('driverPicker');
const bindDriverBtn = document.getElementById('bindDriverBtn');
const invoiceNumberInput = document.getElementById('invoiceNumber');
const invoiceHint = document.getElementById('invoiceHint');
const paymentMethodSelect = document.getElementById('paymentMethod');
const notesInput = document.getElementById('notes');
const captureBtn = document.getElementById('captureBtn');
const removeScanBtn = document.getElementById('removeScanBtn');
const clearScansBtn = document.getElementById('clearScansBtn');
const switchBtn = document.getElementById('switchBtn');
const openCameraBtn = document.getElementById('openCameraBtn');
const edgeCropToggle = document.getElementById('edgeCropToggle');
const submitBtn = document.getElementById('submitBtn');
const syncBtn = document.getElementById('syncBtn');
const video = document.getElementById('cameraPreview');
const edgeOverlay = document.getElementById('edgeOverlay');
const captureGuide = document.getElementById('captureGuide');
const canvas = document.getElementById('canvas');
const imagePreview = document.getElementById('capturedImage');
const scanSummary = document.getElementById('scanSummary');
const scanList = document.getElementById('scanList');
const statusEl = document.getElementById('status');
const adminNav = document.getElementById('adminNav');
const queueCount = document.getElementById('queueCount');
const connectionState = document.getElementById('connectionState');
const healthTitle = document.getElementById('healthTitle');
const healthPendingLabel = document.getElementById('healthPendingLabel');
const healthLastSyncLabel = document.getElementById('healthLastSyncLabel');
const healthFailedLabel = document.getElementById('healthFailedLabel');
const healthPendingValue = document.getElementById('healthPendingValue');
const healthLastSyncValue = document.getElementById('healthLastSyncValue');
const healthFailedValue = document.getElementById('healthFailedValue');
const functionBadge = document.getElementById('functionBadge');
const documentPrefixEl = document.getElementById('documentPrefix');
const dynamicFieldContainer = document.getElementById('dynamicFieldContainer');

let stream;
let cameraActive = false;
let currentFacingMode = 'environment';
let drivers = [];
let pendingQueue = [];
let capturedScans = [];
let boundDriverId = localStorage.getItem('pod-device-driver') || '';
let autoEdgeCropEnabled = localStorage.getItem('pod-auto-edge-crop') === '1';
let settings = null;
let invoiceRegex = /^INV-\d{4}$/i;
let activeFunctionCode = 'pod-sb';
let activeFunctionConfig = null;
let dynamicFieldInputs = {};
let scannerEngine = null;
let autoCaptureLock = false;
let cameraStarting = false;
let health = {
  failedUploads: 0,
  lastSyncAt: ''
};
const queueDbName = 'pod-offline-db';
const queueStoreName = 'queue';
const queueDbVersion = 1;

const defaultFunctionConfigs = [
  {
    code: 'pod-sb',
    label: 'POD-SB',
    documentPrefix: 'INV-',
    documentLabel: 'Invoice number',
    documentPlaceholder: '1042',
    documentPattern: '^\\d+$',
    documentPatternHint: 'Numbers only. INV- is added automatically.',
    filenamePrefix: 'PODSB',
    extraFields: []
  },
  {
    code: 'pod-just',
    label: 'POD-Just',
    documentPrefix: 'INV-',
    documentLabel: 'Invoice number',
    documentPlaceholder: '1042',
    documentPattern: '^\\d+$',
    documentPatternHint: 'Numbers only. INV- is added automatically.',
    filenamePrefix: 'PODSB',
    extraFields: []
  },
  {
    code: 'receipt-sb',
    label: 'Receipt-SB',
    documentPrefix: 'RCPT-',
    documentLabel: 'Receipt number',
    documentPlaceholder: '9931',
    documentPattern: '^\\d+$',
    documentPatternHint: 'Numbers only. RCPT- is added automatically.',
    filenamePrefix: 'RECSB',
    extraFields: [
      {
        key: 'amount',
        label: 'Receipt amount',
        type: 'text',
        placeholder: '1200.50',
        required: true
      }
    ]
  },
  {
    code: 'receipt-just',
    label: 'Receipt-Just',
    documentPrefix: 'RCPT-',
    documentLabel: 'Receipt number',
    documentPlaceholder: '9931',
    documentPattern: '^\\d+$',
    documentPatternHint: 'Numbers only. RCPT- is added automatically.',
    filenamePrefix: 'RECJUST',
    extraFields: [
      {
        key: 'customerCode',
        label: 'Customer code',
        type: 'text',
        placeholder: 'CUST-44',
        required: true
      }
    ]
  }
];

function openQueueDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(queueDbName, queueDbVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(queueStoreName)) {
        db.createObjectStore(queueStoreName, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

async function readAllQueueFromDb() {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(queueStoreName, 'readonly');
    const store = tx.objectStore(queueStoreName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Failed to read queue records'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function writeAllQueueToDb(items) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(queueStoreName, 'readwrite');
    const store = tx.objectStore(queueStoreName);
    store.clear();
    items.forEach(item => store.put(item));

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Failed to write queue records'));
    };
  });
}

function getActiveTheme(settingsObj) {
  const presetKey = settingsObj.activeThemePreset;
  const preset = settingsObj.themePresets && settingsObj.themePresets[presetKey];
  if (preset) return preset;
  return settingsObj.theme || settingsObj.themePresets?.ocean || {};
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--bg-spot-1', theme.bgSpot1 || 'rgba(226, 31, 43, 0.28)');
  root.style.setProperty('--bg-spot-2', theme.bgSpot2 || 'rgba(217, 31, 111, 0.26)');
  root.style.setProperty('--bg-spot-3', theme.bgSpot3 || 'rgba(146, 204, 56, 0.2)');
  root.style.setProperty('--bg-spot-4', theme.bgSpot4 || 'rgba(0, 119, 200, 0.22)');
  root.style.setProperty('--panel', theme.panel);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent-2', theme.accent2);
  root.style.setProperty('--accent-3', theme.accent3 || theme.accent2 || theme.accent);
  root.style.setProperty('--accent-4', theme.accent4 || theme.accent2 || theme.accent);
  root.style.setProperty('--text', theme.text);
  root.style.setProperty('--muted', theme.muted);
  root.style.setProperty('--border', theme.border);
  root.style.setProperty('--form-bg', theme.formBg);
  root.style.setProperty('--form-text', theme.formText);
  root.style.setProperty('--secondary-button-bg', theme.secondaryButtonBg);
}

function getFunctionDefinitions() {
  const configured = Array.isArray(settings?.functions) ? settings.functions : [];
  const source = configured.length ? configured : defaultFunctionConfigs;
  return source.map(item => ({
    ...item,
    code: String(item.code || '').trim().toLowerCase()
  })).filter(item => item.code);
}

function resolveRequestedFunctionCode() {
  const queryValue = new URLSearchParams(window.location.search).get('fn');
  const localValue = localStorage.getItem('pod-selected-function');
  return String(queryValue || localValue || 'pod-sb').trim().toLowerCase();
}

function getFunctionConfig(code) {
  const definitions = getFunctionDefinitions();
  const found = definitions.find(item => item.code === code);
  if (found) return found;
  return definitions[0] || defaultFunctionConfigs[0];
}

function applyFunctionThemeClass(code) {
  const classes = ['function-pod-sb', 'function-pod-just', 'function-receipt-sb', 'function-receipt-just'];
  document.body.classList.remove(...classes);
  document.body.classList.add(`function-${code}`);
}

function renderDynamicFields() {
  dynamicFieldInputs = {};
  if (!dynamicFieldContainer) return;

  dynamicFieldContainer.innerHTML = '';
  const fields = Array.isArray(activeFunctionConfig?.extraFields) ? activeFunctionConfig.extraFields : [];
  fields.forEach(field => {
    const key = String(field.key || '').trim();
    if (!key) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'field';

    const label = document.createElement('label');
    label.textContent = field.label || key;

    const input = document.createElement('input');
    input.type = field.type || 'text';
    input.placeholder = field.placeholder || '';
    input.dataset.fieldKey = key;
    if (field.required) {
      input.setAttribute('required', 'required');
    }

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    dynamicFieldContainer.appendChild(wrapper);
    dynamicFieldInputs[key] = input;
  });
}

function applyFunctionUi() {
  if (!activeFunctionConfig) return;
  applyFunctionThemeClass(activeFunctionConfig.code);

  const baseTheme = getActiveTheme(settings);
  const functionTheme = activeFunctionConfig.theme || {};
  applyTheme({
    ...baseTheme,
    ...functionTheme
  });

  const label = activeFunctionConfig.label || activeFunctionConfig.code;
  if (functionBadge) {
    functionBadge.textContent = `Function: ${label}`;
  }

  if (documentPrefixEl) {
    documentPrefixEl.textContent = activeFunctionConfig.documentPrefix || 'INV-';
  }

  const documentLabel = activeFunctionConfig.documentLabel || settings?.ui?.invoiceLabel || 'Document number';
  document.getElementById('invoiceLabel').textContent = documentLabel;
  invoiceNumberInput.placeholder = activeFunctionConfig.documentPlaceholder || settings?.ui?.invoicePlaceholder || '1042';
  invoiceHint.textContent = activeFunctionConfig.documentPatternHint || settings?.ui?.invoicePatternHint || 'Numbers only.';

  renderDynamicFields();
}

function applyUiSettings(ui) {
  document.getElementById('appTitle').textContent = ui.appTitle;
  document.getElementById('subtitle').textContent = ui.subtitle;
  document.getElementById('badgeText').textContent = ui.badgeText;
  document.getElementById('driverLabel').textContent = ui.driverLabel;
  document.getElementById('driverBindLabel').textContent = ui.driverBindLabel;
  document.getElementById('invoiceLabel').textContent = ui.invoiceLabel;
  document.getElementById('paymentLabel').textContent = ui.paymentLabel;
  document.getElementById('notesLabel').textContent = ui.notesLabel || 'Notes';
  invoiceHint.textContent = ui.invoicePatternHint || 'Numbers only. The INV- prefix is added automatically.';
  invoiceNumberInput.placeholder = ui.invoicePlaceholder || '1042';
  notesInput.placeholder = ui.notesPlaceholder || 'Optional notes for this POD submission';
  bindDriverBtn.textContent = ui.driverBindButton;
  captureBtn.textContent = ui.captureButton;
  removeScanBtn.textContent = ui.removeScanButton || 'Remove last scan';
  clearScansBtn.textContent = ui.clearScansButton || 'Clear scans';
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
  const patternSource = activeFunctionConfig?.documentPattern || form.invoicePattern || '^\\d+$';
  try {
    invoiceRegex = new RegExp(patternSource, form.invoicePatternFlags || '');
  } catch (error) {
    invoiceRegex = /^\d+$/;
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

function setAutoEdgeCropEnabled(enabled) {
  autoEdgeCropEnabled = Boolean(enabled);
  localStorage.setItem('pod-auto-edge-crop', autoEdgeCropEnabled ? '1' : '0');
  if (edgeCropToggle) {
    edgeCropToggle.checked = autoEdgeCropEnabled;
  }
}

async function loadSettings() {
  const response = await fetch('/settings/app_settings.json');
  settings = await response.json();
  activeFunctionCode = resolveRequestedFunctionCode();
  activeFunctionConfig = getFunctionConfig(activeFunctionCode);
  localStorage.setItem('pod-selected-function', activeFunctionConfig.code);
  applyTheme(getActiveTheme(settings));
  applyUiSettings(settings.ui);
  applyFunctionUi();
  applyPaymentOptions(settings.form);
  setupValidation(settings.form);
  setAutoEdgeCropEnabled(autoEdgeCropEnabled);
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

  const isAdminDevice = Boolean(boundDriver && (boundDriver.folder || '').trim().toLowerCase() === 'jonathan-admin');
  if (adminNav) {
    adminNav.classList.toggle('hidden', !isAdminDevice);
  }

  if (boundDriver && activeFunctionConfig) {
    const allowed = Array.isArray(boundDriver.functions) && boundDriver.functions.length
      ? boundDriver.functions.map(value => String(value || '').toLowerCase()).includes(activeFunctionConfig.code)
      : true;
    if (!allowed) {
      statusEl.textContent = `${activeFunctionConfig.label} is disabled for this staff member. Go back and choose another function.`;
    }
  }
}

function loadDrivers() {
  return fetch('/api/drivers')
    .then(res => res.json())
    .then(items => {
      drivers = (Array.isArray(items) ? items : []).map(item => ({
        ...item,
        functions: Array.isArray(item.functions) ? item.functions : []
      }));
      renderDriverOptions();
      renderDriverState();
    })
    .catch(() => {
      drivers = [
        { id: 'driver-001', name: 'Jonathan (Admin)', folder: 'Jonathan-Admin', functions: ['pod-sb', 'pod-just', 'receipt-sb', 'receipt-just'] },
        { id: 'driver-002', name: 'Deon', folder: 'Deon', functions: ['pod-sb', 'receipt-sb'] },
        { id: 'driver-003', name: 'Themba', folder: 'Themba', functions: ['pod-sb', 'pod-just'] },
        { id: 'driver-004', name: 'Janine', folder: 'Janine', functions: ['receipt-sb', 'receipt-just'] },
        { id: 'driver-005', name: 'Wilna', folder: 'Wilna', functions: ['pod-sb', 'pod-just', 'receipt-sb', 'receipt-just'] }
      ];
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

async function startCamera(forceRestart = false) {
  if (cameraStarting) {
    return;
  }

  if (cameraActive && stream && !forceRestart) {
    return;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    statusEl.textContent = 'Camera is not supported on this device/browser.';
    return;
  }

  cameraStarting = true;
  if (openCameraBtn) {
    openCameraBtn.disabled = true;
  }

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }

  try {
    statusEl.textContent = 'Opening camera. Allow permission if prompted.';
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: currentFacingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    await enableCameraAutoFocus(stream);
    updateCameraUiState(true);
    statusEl.textContent = 'Rear camera ready. Hold document steady for auto capture or tap capture.';

    // Do not block camera-open UX on scanner boot; enhancement can start in the background.
    void setupScannerEngine();
  } catch (error) {
    updateCameraUiState(false);
    statusEl.textContent = 'Camera access is blocked. Please allow camera access.';
  } finally {
    cameraStarting = false;
    if (openCameraBtn) {
      openCameraBtn.disabled = false;
    }
  }
}

async function setupScannerEngine() {
  if (!window.DocScanner || !edgeOverlay || !video) {
    scannerEngine = null;
    return;
  }

  if (scannerEngine) {
    scannerEngine.stop();
    scannerEngine = null;
  }

  const scannerConfig = settings?.scanner || {};
  try {
    const createPromise = window.DocScanner.create({
      video,
      overlayCanvas: edgeOverlay,
      minFocusScore: Number(scannerConfig.minFocusScore || 120),
      minAreaRatio: Number(scannerConfig.minAreaRatio || 0.2),
      requiredStableFrames: Number(scannerConfig.requiredStableFrames || 10),
      autoCaptureCooldownMs: Number(scannerConfig.autoCaptureCooldownMs || 1800),
      onStatus: message => {
        if (message && cameraActive) {
          statusEl.textContent = message;
        }
      },
      onAutoCapture: () => {
        if (autoCaptureLock) return;
        autoCaptureLock = true;
        captureInvoice(true).finally(() => {
          window.setTimeout(() => {
            autoCaptureLock = false;
          }, Number(scannerConfig.autoCaptureLockMs || 1200));
        });
      }
    });
    scannerEngine = await Promise.race([
      createPromise,
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('Scanner initialization timed out')), Number(scannerConfig.initTimeoutMs || 6000));
      })
    ]);
    if (!cameraActive) {
      scannerEngine.stop();
      scannerEngine = null;
      return;
    }
    scannerEngine.start();
  } catch (error) {
    scannerEngine = null;
    if (cameraActive) {
      statusEl.textContent = 'Scanner enhancement unavailable. Using manual capture mode.';
    }
  }
}

async function enableCameraAutoFocus(activeStream) {
  const track = activeStream?.getVideoTracks?.()[0];
  if (!track || typeof track.applyConstraints !== 'function') {
    return;
  }

  const capabilities = typeof track.getCapabilities === 'function'
    ? track.getCapabilities()
    : null;

  const advanced = [];
  if (Array.isArray(capabilities?.focusMode)) {
    if (capabilities.focusMode.includes('continuous')) {
      advanced.push({ focusMode: 'continuous' });
    } else if (capabilities.focusMode.includes('single-shot')) {
      advanced.push({ focusMode: 'single-shot' });
    }
  }

  // Some devices expose focus distance but not focusMode. Zero usually maps to nearest auto-focus baseline.
  if (capabilities && Object.prototype.hasOwnProperty.call(capabilities, 'focusDistance')) {
    advanced.push({ focusDistance: 0 });
  }

  if (!advanced.length) {
    return;
  }

  try {
    await track.applyConstraints({ advanced });
  } catch (error) {
    // Ignore unsupported focus constraints and keep camera usable.
  }
}

function updateCameraUiState(isActive) {
  cameraActive = isActive;
  if (video) {
    video.classList.toggle('hidden', !isActive);
  }
  if (captureGuide) {
    captureGuide.classList.toggle('hidden', !isActive);
  }
  if (edgeOverlay) {
    edgeOverlay.classList.toggle('hidden', !isActive);
  }
  if (openCameraBtn) {
    openCameraBtn.textContent = isActive ? 'Close camera' : 'Open camera';
  }
  captureBtn.disabled = !isActive;
  switchBtn.disabled = !isActive;
}

function stopCamera() {
  if (scannerEngine) {
    scannerEngine.stop();
    scannerEngine = null;
  }
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = undefined;
  }
  video.pause();
  video.srcObject = null;
  updateCameraUiState(false);
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

function refreshScanSummary() {
  const count = capturedScans.length;
  scanSummary.textContent = `${count} scan${count === 1 ? '' : 's'} captured`;
  scanList.innerHTML = '';

  capturedScans.forEach((scan, index) => {
    const pill = document.createElement('span');
    pill.className = 'scan-pill';
    const warningText = scan.qualityWarnings.length ? ' (warning)' : '';
    pill.textContent = `Scan ${index + 1}${warningText}`;
    scanList.appendChild(pill);
  });

  if (!count) {
    imagePreview.classList.add('hidden');
    imagePreview.removeAttribute('src');
  }
}

function clampColor(value) {
  return Math.max(0, Math.min(255, value));
}

function detectDocumentBounds(imageData, width, height) {
  const pixelCount = width * height;
  if (!pixelCount) return null;

  const grayscale = new Uint8Array(pixelCount);
  const source = imageData.data;
  for (let i = 0; i < pixelCount; i += 1) {
    const base = i * 4;
    grayscale[i] = Math.round((source[base] * 0.3) + (source[base + 1] * 0.59) + (source[base + 2] * 0.11));
  }

  const verticalStrength = new Float32Array(width);
  const horizontalStrength = new Float32Array(height);

  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const idx = y * width + x;
      const gx = Math.abs(grayscale[idx] - grayscale[idx - 1]);
      const gy = Math.abs(grayscale[idx] - grayscale[idx - width]);
      verticalStrength[x] += gx;
      horizontalStrength[y] += gy;
    }
  }

  const smoothWindow = 2;
  function dominantEdge(strength, start, end) {
    let bestIndex = start;
    let bestScore = -1;

    for (let i = start; i <= end; i += 1) {
      let score = 0;
      let weight = 0;

      for (let offset = -smoothWindow; offset <= smoothWindow; offset += 1) {
        const sampleIndex = i + offset;
        if (sampleIndex < start || sampleIndex > end) continue;
        const sampleWeight = smoothWindow + 1 - Math.abs(offset);
        score += strength[sampleIndex] * sampleWeight;
        weight += sampleWeight;
      }

      const normalizedScore = weight ? score / weight : 0;
      if (normalizedScore > bestScore) {
        bestScore = normalizedScore;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  const left = dominantEdge(verticalStrength, Math.floor(width * 0.05), Math.floor(width * 0.45));
  const right = dominantEdge(verticalStrength, Math.floor(width * 0.55), Math.floor(width * 0.95));
  const top = dominantEdge(horizontalStrength, Math.floor(height * 0.05), Math.floor(height * 0.45));
  const bottom = dominantEdge(horizontalStrength, Math.floor(height * 0.55), Math.floor(height * 0.95));

  const detectedWidth = right - left;
  const detectedHeight = bottom - top;
  if (detectedWidth < width * 0.3 || detectedHeight < height * 0.25) {
    return null;
  }

  const padX = Math.round(width * 0.015);
  const padY = Math.round(height * 0.015);
  return {
    x: Math.max(0, left - padX),
    y: Math.max(0, top - padY),
    width: Math.min(width, detectedWidth + (padX * 2)),
    height: Math.min(height, detectedHeight + (padY * 2))
  };
}

function enhanceColorScan(imageData) {
  const { width, height, data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const avg = (r + g + b) / 3;
    const saturatedR = avg + ((r - avg) * 1.12);
    const saturatedG = avg + ((g - avg) * 1.12);
    const saturatedB = avg + ((b - avg) * 1.12);

    data[i] = clampColor(((saturatedR - 128) * 1.08) + 128);
    data[i + 1] = clampColor(((saturatedG - 128) * 1.08) + 128);
    data[i + 2] = clampColor(((saturatedB - 128) * 1.08) + 128);
  }

  const source = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const left = index - 4;
      const right = index + 4;
      const up = index - (width * 4);
      const down = index + (width * 4);

      for (let c = 0; c < 3; c += 1) {
        const sharpened = (source[index + c] * 5)
          - source[left + c]
          - source[right + c]
          - source[up + c]
          - source[down + c];
        data[index + c] = clampColor(sharpened);
      }
    }
  }

  return imageData;
}

function optimizeScanCanvas(sourceCanvas) {
  const maxSide = settings?.form?.maxScanSidePx || 1500;
  const jpegQuality = settings?.form?.jpegQuality || 0.78;
  const sourceWidth = sourceCanvas.width;
  const sourceHeight = sourceCanvas.height;
  const longestSide = Math.max(sourceWidth, sourceHeight) || 1;
  const scale = longestSide > maxSide ? (maxSide / longestSide) : 1;
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  if (scale >= 1) {
    return sourceCanvas.toDataURL('image/jpeg', jpegQuality);
  }

  const optimizedCanvas = document.createElement('canvas');
  optimizedCanvas.width = targetWidth;
  optimizedCanvas.height = targetHeight;
  const optimizedContext = optimizedCanvas.getContext('2d');
  optimizedContext.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
  return optimizedCanvas.toDataURL('image/jpeg', jpegQuality);
}

function processScanFromCurrentFrame(useEdgeCrop) {
  const context = canvas.getContext('2d');
  canvas.width = video.videoWidth || 1200;
  canvas.height = video.videoHeight || 800;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  let detectedBounds = null;
  let scale = 1;
  if (useEdgeCrop) {
    const maxDetectionSide = 920;
    scale = Math.min(1, maxDetectionSide / Math.max(canvas.width, canvas.height));
    const detectionWidth = Math.max(1, Math.round(canvas.width * scale));
    const detectionHeight = Math.max(1, Math.round(canvas.height * scale));
    const detectionCanvas = document.createElement('canvas');
    detectionCanvas.width = detectionWidth;
    detectionCanvas.height = detectionHeight;
    const detectionContext = detectionCanvas.getContext('2d');
    detectionContext.drawImage(canvas, 0, 0, detectionWidth, detectionHeight);
    const detectionImage = detectionContext.getImageData(0, 0, detectionWidth, detectionHeight);
    detectedBounds = detectDocumentBounds(detectionImage, detectionWidth, detectionHeight);
  }

  let outputCanvas = canvas;
  let outputContext = context;
  if (useEdgeCrop && detectedBounds) {
    const mapped = {
      x: Math.max(0, Math.round(detectedBounds.x / scale)),
      y: Math.max(0, Math.round(detectedBounds.y / scale)),
      width: Math.max(1, Math.round(detectedBounds.width / scale)),
      height: Math.max(1, Math.round(detectedBounds.height / scale))
    };

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = Math.min(canvas.width - mapped.x, mapped.width);
    cropCanvas.height = Math.min(canvas.height - mapped.y, mapped.height);
    const cropContext = cropCanvas.getContext('2d');
    cropContext.drawImage(
      canvas,
      mapped.x,
      mapped.y,
      cropCanvas.width,
      cropCanvas.height,
      0,
      0,
      cropCanvas.width,
      cropCanvas.height
    );
    outputCanvas = cropCanvas;
    outputContext = cropContext;
  }

  const enhancedImage = enhanceColorScan(outputContext.getImageData(0, 0, outputCanvas.width, outputCanvas.height));
  outputContext.putImageData(enhancedImage, 0, 0);
  const qualityWarnings = evaluateImageQuality(enhancedImage);
  const optimizedDataUrl = optimizeScanCanvas(outputCanvas);

  return {
    dataUrl: optimizedDataUrl,
    qualityWarnings,
    edgeDetected: Boolean(detectedBounds),
    edgeCropRequested: Boolean(useEdgeCrop)
  };
}

async function captureInvoice(isAutoCapture = false) {
  if (!cameraActive || !stream || video.readyState < 2) {
    statusEl.textContent = 'Open camera first, then capture the scan.';
    return;
  }

  let result = null;

  if (scannerEngine) {
    const scanned = await scannerEngine.captureProcessed();
    if (!scanned.ok) {
      statusEl.textContent = scanned.reason || 'Capture rejected. Please retry with better focus.';
      return;
    }

    result = {
      dataUrl: scanned.dataUrl,
      qualityWarnings: [],
      edgeDetected: scanned.edgeDetected,
      edgeCropRequested: true,
      focusScore: scanned.focusScore
    };
  } else {
    result = processScanFromCurrentFrame(autoEdgeCropEnabled);
  }

  capturedScans.push(result);
  imagePreview.src = result.dataUrl;
  imagePreview.classList.remove('hidden');
  refreshScanSummary();

  if (result.qualityWarnings.length) {
    if (result.edgeCropRequested && result.edgeDetected) {
      statusEl.textContent = `Color scan captured with edge crop and warning: ${result.qualityWarnings.join(' ')}`;
    } else if (result.edgeCropRequested) {
      statusEl.textContent = `Color scan captured without edge crop (edge not detected) and warning: ${result.qualityWarnings.join(' ')}`;
    } else {
      statusEl.textContent = `Color scan captured (full frame) and warning: ${result.qualityWarnings.join(' ')}`;
    }
  } else if (!result.edgeCropRequested) {
    statusEl.textContent = 'Color scan captured in full-frame mode. Add more scans if needed, then save to the queue as a PDF.';
  } else {
    statusEl.textContent = result.edgeDetected
      ? `${isAutoCapture ? 'Auto-captured' : 'Captured'} enhanced scan with edge detection. Add more scans if needed, then save to the queue as a PDF.`
      : `${isAutoCapture ? 'Auto-captured' : 'Captured'} enhanced scan without reliable edge lock. Add more scans if needed, then save to the queue as a PDF.`;
  }
}

function removeLastScan() {
  if (!capturedScans.length) {
    statusEl.textContent = 'No scans to remove.';
    return;
  }

  capturedScans.pop();
  if (capturedScans.length) {
    imagePreview.src = capturedScans[capturedScans.length - 1].dataUrl;
    imagePreview.classList.remove('hidden');
  }
  refreshScanSummary();
  statusEl.textContent = 'Removed the most recent scan.';
}

function clearScans() {
  capturedScans = [];
  refreshScanSummary();
  statusEl.textContent = 'Cleared all captured scans.';
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function jpegDimensions(bytes) {
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
    throw new Error('Invalid JPEG scan');
  }

  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xFF) {
      offset += 1;
      continue;
    }

    let marker = bytes[offset + 1];
    while (marker === 0xFF) {
      offset += 1;
      marker = bytes[offset + 1];
    }

    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (!length || offset + 2 + length > bytes.length) {
      break;
    }

    const isSof = (marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7)
      || (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF);
    if (isSof) {
      const height = (bytes[offset + 5] << 8) + bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) + bytes[offset + 8];
      return { width, height };
    }

    offset += 2 + length;
  }

  throw new Error('Unable to determine JPEG dimensions');
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function escapePdfLiteral(text) {
  return String(text || '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapNotesForPdf(text, maxCharsPerLine, maxLines) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const words = cleaned.split(' ');
  const lines = [];
  let current = '';

  words.forEach(word => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
    }
    current = word;
  });

  if (current) {
    lines.push(current);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const clipped = lines.slice(0, maxLines);
  const lastIndex = clipped.length - 1;
  clipped[lastIndex] = `${clipped[lastIndex].slice(0, Math.max(0, maxCharsPerLine - 3))}...`;
  return clipped;
}

function buildNotesPageContent(pageWidth, pageHeight, notesText) {
  const marginX = 54;
  const marginTop = 72;
  const titleFontSize = 22;
  const bodyFontSize = 13;
  const lineHeight = 20;
  const maxCharsPerLine = Math.max(40, Math.floor((pageWidth - (marginX * 2)) / 7.2));
  const bodyLines = wrapNotesForPdf(notesText, maxCharsPerLine, 80);

  if (!bodyLines.length) {
    return '';
  }

  let currentY = pageHeight - marginTop;

  const commands = [
    'q',
    '1 1 1 rg',
    `0 0 ${pageWidth} ${pageHeight} re`,
    'f',
    '0 0 0 rg',
    'BT',
    `/F1 ${titleFontSize} Tf`,
    `1 0 0 1 ${marginX} ${currentY} Tm`,
    `(Driver Notes) Tj`,
    'ET'
  ];

  currentY -= 34;
  bodyLines.forEach(line => {
    if (currentY < 50) {
      return;
    }
    commands.push('BT');
    commands.push(`/F1 ${bodyFontSize} Tf`);
    commands.push(`1 0 0 1 ${marginX} ${currentY} Tm`);
    commands.push(`(${escapePdfLiteral(line)}) Tj`);
    commands.push('ET');
    currentY -= lineHeight;
  });

  commands.push('Q');
  return `${commands.join('\n')}\n`;
}

function createPdfDataUrl(scans, notesText = '') {
  const encoder = new TextEncoder();
  const objects = [];

  const trimmedNotes = String(notesText || '').trim();
  const hasNotesPage = Boolean(trimmedNotes);
  const catalogObjId = 1;
  const pagesObjId = 2;
  const fontObjId = hasNotesPage ? 3 : null;
  let nextObjId = hasNotesPage ? 4 : 3;
  const pageObjectIds = [];

  if (hasNotesPage) {
    objects[fontObjId] = {
      text: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    };
  }

  scans.forEach(scan => {
    const jpegBytes = dataUrlToBytes(scan.dataUrl);
    const dimensions = jpegDimensions(jpegBytes);
    const pageObjId = nextObjId;
    const contentObjId = nextObjId + 1;
    const imageObjId = nextObjId + 2;
    nextObjId += 3;

    pageObjectIds.push(pageObjId);

    const width = Math.max(dimensions.width, 1);
    const height = Math.max(dimensions.height, 1);
    const contentText = `q\n${width} 0 0 ${height} 0 0 cm\n/Im1 Do\nQ\n`;
    const contentLength = encoder.encode(contentText).length;

    objects[pageObjId] = {
      text: `<< /Type /Page /Parent ${pagesObjId} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im1 ${imageObjId} 0 R >> >> /Contents ${contentObjId} 0 R >>`
    };

    objects[contentObjId] = {
      text: `<< /Length ${contentLength} >>\nstream\n${contentText}endstream`
    };

    const header = encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
    const footer = encoder.encode('\nendstream');
    const streamBytes = new Uint8Array(header.length + jpegBytes.length + footer.length);
    streamBytes.set(header, 0);
    streamBytes.set(jpegBytes, header.length);
    streamBytes.set(footer, header.length + jpegBytes.length);
    objects[imageObjId] = { bytes: streamBytes };
  });

  if (hasNotesPage && fontObjId) {
    const notesPageObjId = nextObjId;
    const notesContentObjId = nextObjId + 1;
    nextObjId += 2;

    const notesWidth = 595;
    const notesHeight = 842;
    const notesContent = buildNotesPageContent(notesWidth, notesHeight, trimmedNotes);
    const notesLength = encoder.encode(notesContent).length;

    pageObjectIds.push(notesPageObjId);
    objects[notesPageObjId] = {
      text: `<< /Type /Page /Parent ${pagesObjId} 0 R /MediaBox [0 0 ${notesWidth} ${notesHeight}] /Resources << /Font << /F1 ${fontObjId} 0 R >> >> /Contents ${notesContentObjId} 0 R >>`
    };
    objects[notesContentObjId] = {
      text: `<< /Length ${notesLength} >>\nstream\n${notesContent}endstream`
    };
  }

  objects[catalogObjId] = { text: `<< /Type /Catalog /Pages ${pagesObjId} 0 R >>` };
  const kids = pageObjectIds.map(id => `${id} 0 R`).join(' ');
  const pageCount = pageObjectIds.length;
  objects[pagesObjId] = { text: `<< /Type /Pages /Count ${pageCount} /Kids [ ${kids} ] >>` };

  const chunks = [];
  const offsets = [];
  let currentOffset = 0;

  function pushText(text) {
    const bytes = encoder.encode(text);
    chunks.push(bytes);
    currentOffset += bytes.length;
  }

  function pushBytes(bytes) {
    chunks.push(bytes);
    currentOffset += bytes.length;
  }

  pushText('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  for (let objId = 1; objId < objects.length; objId += 1) {
    const obj = objects[objId];
    if (!obj) continue;
    offsets[objId] = currentOffset;
    pushText(`${objId} 0 obj\n`);
    if (obj.bytes) {
      pushBytes(obj.bytes);
      pushText('\n');
    } else {
      pushText(`${obj.text}\n`);
    }
    pushText('endobj\n');
  }

  const xrefOffset = currentOffset;
  const totalObjects = objects.length;
  pushText(`xref\n0 ${totalObjects}\n`);
  pushText('0000000000 65535 f \n');

  for (let objId = 1; objId < totalObjects; objId += 1) {
    const offset = offsets[objId] || 0;
    pushText(`${String(offset).padStart(10, '0')} 00000 n \n`);
  }

  pushText(`trailer\n<< /Size ${totalObjects} /Root ${catalogObjId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let pos = 0;
  chunks.forEach(chunk => {
    output.set(chunk, pos);
    pos += chunk.length;
  });

  return `data:application/pdf;base64,${bytesToBase64(output)}`;
}

function fileNameFromEntry(entry) {
  const d = new Date(entry.timestamp);
  const dateToken = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  const timeToken = `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
  const functionPrefix = entry.functionCode ? String(entry.functionCode).toUpperCase() : 'POD';
  const documentNumber = entry.invoiceNumber || entry.documentNumber || 'DOC-UNKNOWN';
  return `${functionPrefix}-${documentNumber}-${dateToken}-${timeToken}-${entry.driverName}-${entry.paymentMethod}.pdf`.replace(/\s+/g, '-');
}

function refreshQueueCount() {
  const queueLabel = settings?.ui?.queueLabel || 'pending';
  queueCount.textContent = `${pendingQueue.length} ${queueLabel}`;
}

async function loadQueue() {
  try {
    pendingQueue = await readAllQueueFromDb();
    const legacyRaw = localStorage.getItem('pod-queue');
    if (!pendingQueue.length && legacyRaw) {
      const legacyItems = JSON.parse(legacyRaw);
      if (Array.isArray(legacyItems) && legacyItems.length) {
        pendingQueue = legacyItems;
        await writeAllQueueToDb(legacyItems);
      }
      localStorage.removeItem('pod-queue');
    }
  } catch (error) {
    const raw = localStorage.getItem('pod-queue');
    pendingQueue = raw ? JSON.parse(raw) : [];
  }
  refreshQueueCount();
  refreshHealthPanel();
}

async function saveQueue() {
  try {
    await writeAllQueueToDb(pendingQueue);
  } catch (error) {
    // Fallback for browsers where IndexedDB is unavailable or blocked.
    localStorage.setItem('pod-queue', JSON.stringify(pendingQueue));
  }
  refreshQueueCount();
  refreshHealthPanel();
}

function isInvoiceValid(invoiceNumber) {
  return invoiceRegex.test(invoiceNumber);
}

function normalizeInvoiceNumber(rawValue) {
  const prefix = String(activeFunctionConfig?.documentPrefix || '').replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const prefixPattern = prefix ? new RegExp(`^${prefix}`, 'i') : null;
  const cleaned = rawValue.trim().replace(/\s+/g, '');
  return prefixPattern ? cleaned.replace(prefixPattern, '') : cleaned;
}

async function enqueueEntry() {
  const selectedDriver = getBoundDriver();
  if (!selectedDriver) {
    statusEl.textContent = 'Link this device to a driver first.';
    return;
  }

  const allowedFunctions = Array.isArray(selectedDriver.functions) && selectedDriver.functions.length
    ? selectedDriver.functions.map(value => String(value || '').toLowerCase())
    : [];
  if (allowedFunctions.length && !allowedFunctions.includes(activeFunctionConfig.code)) {
    statusEl.textContent = `${activeFunctionConfig.label} is disabled for this staff member.`;
    return;
  }

  if (!capturedScans.length || !invoiceNumberInput.value.trim()) {
    statusEl.textContent = 'Capture at least one scan and add an invoice number before saving.';
    return;
  }

  const invoiceDigits = normalizeInvoiceNumber(invoiceNumberInput.value);
  if (!isInvoiceValid(invoiceDigits)) {
    statusEl.textContent = 'Invoice number must contain digits only.';
    return;
  }
  const documentPrefix = activeFunctionConfig.documentPrefix || 'INV-';
  const invoiceNumber = `${documentPrefix}${invoiceDigits}`;

  const extraFields = {};
  const extraFieldDefs = Array.isArray(activeFunctionConfig.extraFields) ? activeFunctionConfig.extraFields : [];
  for (const field of extraFieldDefs) {
    const key = String(field.key || '').trim();
    if (!key) continue;

    const value = String(dynamicFieldInputs[key]?.value || '').trim();
    if (field.required && !value) {
      statusEl.textContent = `${field.label || key} is required for ${activeFunctionConfig.label}.`;
      return;
    }
    extraFields[key] = value;
  }

  let pdfDataUrl = '';
  try {
    pdfDataUrl = createPdfDataUrl(capturedScans, notesInput.value.trim());
  } catch (error) {
    statusEl.textContent = 'Unable to generate a PDF from captured scans. Please recapture and try again.';
    return;
  }

  const combinedWarnings = [...new Set(capturedScans.flatMap(scan => scan.qualityWarnings))];
  const notes = notesInput.value.trim();

  const entry = {
    id: `${Date.now()}`,
    driverId: selectedDriver.id,
    driverName: selectedDriver.name,
    folder: selectedDriver.folder || selectedDriver.name,
    functionCode: activeFunctionConfig.code,
    functionLabel: activeFunctionConfig.label,
    invoiceNumber,
    documentNumber: invoiceNumber,
    paymentMethod: paymentMethodSelect.value,
    notes,
    extraFields,
    scanCount: capturedScans.length,
    documentMimeType: 'application/pdf',
    imageData: pdfDataUrl,
    qualityWarnings: combinedWarnings,
    timestamp: new Date().toISOString(),
    filename: ''
  };
  entry.filename = fileNameFromEntry(entry);
  pendingQueue.push(entry);
  await saveQueue();

  if (combinedWarnings.length) {
    statusEl.textContent = `Saved PDF with warning. ${combinedWarnings.join(' ')} File: ${entry.filename}`;
  } else {
    statusEl.textContent = `Saved offline as PDF: ${entry.filename}`;
  }

  invoiceNumberInput.value = '';
  notesInput.value = '';
  Object.values(dynamicFieldInputs).forEach(input => {
    input.value = '';
  });
  paymentMethodSelect.value = settings.form.paymentOptions[0];
  capturedScans = [];
  refreshScanSummary();
}

async function syncQueue() {
  if (!navigator.onLine) {
    statusEl.textContent = 'Offline. New deliveries remain safe in the queue.';
    refreshHealthPanel();
    return;
  }

  if (!pendingQueue.length) {
    health.failedUploads = 0;
    health.lastSyncAt = new Date().toISOString();
    saveHealth();
    refreshHealthPanel();
    statusEl.textContent = 'Queue is empty.';
    return;
  }

  const remaining = [];
  let lastError = '';
  let lastSuccessMessage = '';

  for (const item of pendingQueue) {
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Upload failed (${response.status}): ${details || 'Unknown server error'}`);
      }

      const result = await response.json().catch(() => null);
      const oneDrivePath = result?.oneDrive?.relativePath;
      const oneDrivePending = Boolean(result?.oneDrive?.pending);
      const storageLabel = result?.storage || 'server';
      const warning = result?.warning ? ` ${result.warning}` : '';
      if (oneDrivePath) {
        lastSuccessMessage = `Uploaded to ${storageLabel}: ${oneDrivePath}.${warning}`;
      } else if (oneDrivePending) {
        lastSuccessMessage = `Uploaded to ${storageLabel}. Queued for Business OneDrive sync worker.${warning}`;
      } else {
        lastSuccessMessage = `Uploaded to ${storageLabel}.${warning || ' No folder copy was created.'}`;
      }
    } catch (error) {
      remaining.push(item);
      lastError = error?.message || 'Network error while uploading';
    }
  }

  pendingQueue = remaining;
  health.failedUploads = remaining.length;
  health.lastSyncAt = new Date().toISOString();
  saveHealth();
  await saveQueue();

  statusEl.textContent = pendingQueue.length
    ? `Some items need another sync attempt.${lastError ? ` ${lastError}` : ''}`
    : (lastSuccessMessage || 'All deliveries uploaded.');
}

captureBtn.addEventListener('click', () => {
  captureInvoice(false);
});
removeScanBtn.addEventListener('click', removeLastScan);
clearScansBtn.addEventListener('click', clearScans);
if (edgeCropToggle) {
  edgeCropToggle.checked = autoEdgeCropEnabled;
  edgeCropToggle.addEventListener('change', event => {
    setAutoEdgeCropEnabled(Boolean(event.target.checked));
    statusEl.textContent = autoEdgeCropEnabled
      ? 'Auto edge crop is on. Disable it anytime if an invoice gets cut.'
      : 'Auto edge crop is off. Full-frame scans are now used.';
  });
}
if (openCameraBtn) {
  openCameraBtn.addEventListener('click', async () => {
    if (cameraActive) {
      stopCamera();
      statusEl.textContent = 'Camera closed. Tap Open camera when you are ready to scan.';
      return;
    }
    await startCamera();
  });
}
switchBtn.addEventListener('click', async () => {
  if (!cameraActive) {
    statusEl.textContent = 'Open camera first before switching lenses.';
    return;
  }
  currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
  await startCamera(true);
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
  updateCameraUiState(false);
  loadHealth();
  toggleConnectionStatus();
  await loadQueue();
  refreshScanSummary();
  refreshHealthPanel();
  await loadDrivers();
  await syncQueue();
});
