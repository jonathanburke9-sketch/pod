const adminTitle = document.getElementById('adminTitle');
const adminSubtitle = document.getElementById('adminSubtitle');
const adminKeyLabel = document.getElementById('adminKeyLabel');
const adminKeyInput = document.getElementById('adminKey');
const adminStatus = document.getElementById('adminStatus');
const driversBody = document.getElementById('driversBody');
const addDriverBtn = document.getElementById('addDriverBtn');
const removeDriverBtn = document.getElementById('removeDriverBtn');
const saveDriversBtn = document.getElementById('saveDriversBtn');
const saveCategoriesBtn = document.getElementById('saveCategoriesBtn');
const driverSearch = document.getElementById('driverSearch');
const sortOrder = document.getElementById('sortOrder');
const categoryEditor = document.getElementById('categoryEditor');

let settings = null;
let drivers = [];
let selectedDriverId = '';
let functionDefinitions = [];

const defaultFunctionDefinitions = [
  { code: 'pod-sb', label: 'POD-SB' },
  { code: 'pod-just', label: 'POD-Just' },
  { code: 'receipt-sb', label: 'Receipt-SB' },
  { code: 'receipt-just', label: 'Receipt-Just' }
];

function randomId() {
  return `driver-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

function applyAdminUi(settingsObj) {
  const admin = settingsObj.admin;
  adminTitle.textContent = admin.title;
  adminSubtitle.textContent = admin.subtitle;
  adminKeyLabel.textContent = admin.authLabel;
  addDriverBtn.textContent = admin.addButton;
  removeDriverBtn.textContent = admin.removeButton;
  saveDriversBtn.textContent = admin.saveButton;

  driverSearch.placeholder = 'Search by staff name';

  sortOrder.innerHTML = '';
  const options = [
    { value: 'name-asc', label: admin.sortNameAsc || 'Name A-Z' },
    { value: 'name-desc', label: admin.sortNameDesc || 'Name Z-A' }
  ];
  options.forEach(item => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    sortOrder.appendChild(option);
  });
}

function getReceiptCategoriesFromSettings() {
  const options = settings?.form?.receiptCategoryOptions;
  if (!Array.isArray(options) || !options.length) return [];
  return options.map(item => String(item || '').trim()).filter(Boolean);
}

function renderCategoryEditor() {
  if (!categoryEditor) return;
  categoryEditor.value = getReceiptCategoriesFromSettings().join('\n');
}

function getSortedAndFilteredDrivers() {
  const query = driverSearch.value.trim().toLowerCase();
  const filtered = drivers.filter(driver => {
    const name = (driver.name || '').toLowerCase();
    return !query || name.includes(query);
  });

  const order = sortOrder.value;
  filtered.sort((a, b) => {
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();

    if (order === 'name-desc') return nameB.localeCompare(nameA);
    return nameA.localeCompare(nameB);
  });

  return filtered;
}

function renderTable() {
  const visibleDrivers = getSortedAndFilteredDrivers();
  driversBody.innerHTML = '';

  visibleDrivers.forEach(driver => {
    const row = document.createElement('tr');
    if (driver.id === selectedDriverId) {
      row.classList.add('selected');
    }

    row.addEventListener('click', event => {
      // Ignore clicks on interactive controls (checkboxes, inputs) so their own
      // change handlers aren't clobbered by a row re-render before they apply.
      if (event.target.closest('input, label, textarea, select, button')) return;
      selectedDriverId = driver.id;
      renderTable();
    });

    const nameCell = document.createElement('td');
    const functionsCell = document.createElement('td');

    const nameInput = document.createElement('input');
    nameInput.value = driver.name;
    nameInput.addEventListener('input', e => {
      driver.name = e.target.value;
      driver.folder = driver.folder || e.target.value;
    });

    const selectedFunctions = Array.isArray(driver.functions) && driver.functions.length
      ? driver.functions
      : functionDefinitions.map(item => item.code);
    driver.functions = selectedFunctions;

    const wraps = document.createElement('div');
    wraps.className = 'chip-row admin-function-grid';

    functionDefinitions.forEach(def => {
      const label = document.createElement('label');
      label.className = 'toggle-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedFunctions.includes(def.code);
      checkbox.addEventListener('change', event => {
        const nextSet = new Set(Array.isArray(driver.functions) ? driver.functions : []);
        if (event.target.checked) {
          nextSet.add(def.code);
        } else {
          nextSet.delete(def.code);
        }
        driver.functions = Array.from(nextSet);
      });

      const text = document.createElement('span');
      text.textContent = def.label;

      label.appendChild(checkbox);
      label.appendChild(text);
      wraps.appendChild(label);
    });

    nameCell.appendChild(nameInput);
    functionsCell.appendChild(wraps);
    row.appendChild(nameCell);
    row.appendChild(functionsCell);
    driversBody.appendChild(row);
  });
}

async function loadSettings() {
  const response = await fetch('/settings/app_settings.json');
  settings = await response.json();
  applyTheme(getActiveTheme(settings));
  applyAdminUi(settings);
  functionDefinitions = Array.isArray(settings.functions) && settings.functions.length
    ? settings.functions.map(item => ({
      code: String(item.code || '').trim().toLowerCase(),
      label: item.label || item.code
    })).filter(item => item.code)
    : defaultFunctionDefinitions;
  renderCategoryEditor();
}

async function loadDrivers() {
  const response = await fetch('/api/drivers');
  drivers = await response.json();
  drivers = (Array.isArray(drivers) ? drivers : []).map(driver => ({
    ...driver,
    functions: Array.isArray(driver.functions) && driver.functions.length
      ? driver.functions.map(value => String(value || '').trim().toLowerCase()).filter(Boolean)
      : functionDefinitions.map(item => item.code)
  }));
  selectedDriverId = drivers[0] ? drivers[0].id : '';
  renderTable();
}

function addDriver() {
  const next = {
    id: randomId(),
    name: 'New Staff',
    folder: 'New Staff',
    functions: functionDefinitions.map(item => item.code)
  };
  drivers.push(next);
  selectedDriverId = next.id;
  renderTable();
  adminStatus.textContent = 'Staff row added. Edit values and save.';
}

function removeDriver() {
  if (!selectedDriverId) {
    adminStatus.textContent = 'Select a driver row first.';
    return;
  }

  drivers = drivers.filter(driver => driver.id !== selectedDriverId);
  selectedDriverId = drivers[0] ? drivers[0].id : '';
  renderTable();
  adminStatus.textContent = 'Selected staff row removed locally. Save to confirm.';
}

async function saveDrivers() {
  const adminKey = adminKeyInput.value.trim();
  if (!adminKey) {
    adminStatus.textContent = 'Admin key is required.';
    return;
  }

  const response = await fetch('/api/admin/drivers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey
    },
    body: JSON.stringify(drivers.map(driver => ({
      ...driver,
      functions: Array.isArray(driver.functions) ? driver.functions : []
    })))
  });

  if (!response.ok) {
    adminStatus.textContent = 'Save failed. Check admin key.';
    return;
  }

  adminStatus.textContent = 'Staff mapping saved to backend.';
}

async function saveCategories() {
  const adminKey = adminKeyInput.value.trim();
  if (!adminKey) {
    adminStatus.textContent = 'Admin key is required.';
    return;
  }

  const categoryLines = String(categoryEditor?.value || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const uniqueCategories = Array.from(new Set(categoryLines));

  if (!uniqueCategories.length) {
    adminStatus.textContent = 'Add at least one category.';
    return;
  }

  const response = await fetch('/api/admin/settings/form', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey
    },
    body: JSON.stringify({
      receiptCategoryOptions: uniqueCategories
    })
  });

  if (!response.ok) {
    const details = await response.text();
    adminStatus.textContent = `Category save failed. ${details || 'Check admin key.'}`;
    return;
  }

  const updatedSettings = await response.json().catch(() => null);
  if (updatedSettings && updatedSettings.form) {
    settings.form = updatedSettings.form;
  }
  renderCategoryEditor();
  adminStatus.textContent = 'Receipt categories saved.';
}

addDriverBtn.addEventListener('click', addDriver);
removeDriverBtn.addEventListener('click', removeDriver);
saveDriversBtn.addEventListener('click', saveDrivers);
if (saveCategoriesBtn) {
  saveCategoriesBtn.addEventListener('click', saveCategories);
}
driverSearch.addEventListener('input', renderTable);
sortOrder.addEventListener('change', renderTable);

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadDrivers();
  adminStatus.textContent = 'Drivers loaded.';
});
