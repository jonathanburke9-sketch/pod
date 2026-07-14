const adminTitle = document.getElementById('adminTitle');
const adminSubtitle = document.getElementById('adminSubtitle');
const adminKeyLabel = document.getElementById('adminKeyLabel');
const adminKeyInput = document.getElementById('adminKey');
const adminStatus = document.getElementById('adminStatus');
const driversBody = document.getElementById('driversBody');
const addDriverBtn = document.getElementById('addDriverBtn');
const removeDriverBtn = document.getElementById('removeDriverBtn');
const saveDriversBtn = document.getElementById('saveDriversBtn');

let drivers = [];
let selectedDriverId = '';

function randomId() {
  return `driver-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

function applyAdminUi(settings) {
  adminTitle.textContent = settings.admin.title;
  adminSubtitle.textContent = settings.admin.subtitle;
  adminKeyLabel.textContent = settings.admin.authLabel;
  addDriverBtn.textContent = settings.admin.addButton;
  removeDriverBtn.textContent = settings.admin.removeButton;
  saveDriversBtn.textContent = settings.admin.saveButton;
}

function renderTable() {
  driversBody.innerHTML = '';
  drivers.forEach(driver => {
    const row = document.createElement('tr');
    if (driver.id === selectedDriverId) {
      row.classList.add('selected');
    }

    row.addEventListener('click', () => {
      selectedDriverId = driver.id;
      renderTable();
    });

    const nameCell = document.createElement('td');
    const folderCell = document.createElement('td');

    const nameInput = document.createElement('input');
    nameInput.value = driver.name;
    nameInput.addEventListener('input', e => {
      driver.name = e.target.value;
      if (!driver.folder) {
        driver.folder = e.target.value;
      }
    });

    const folderInput = document.createElement('input');
    folderInput.value = driver.folder || driver.name;
    folderInput.addEventListener('input', e => {
      driver.folder = e.target.value;
    });

    nameCell.appendChild(nameInput);
    folderCell.appendChild(folderInput);
    row.appendChild(nameCell);
    row.appendChild(folderCell);
    driversBody.appendChild(row);
  });
}

async function loadSettings() {
  const response = await fetch('/settings/app_settings.json');
  const settings = await response.json();
  applyTheme(settings.theme);
  applyAdminUi(settings);
}

async function loadDrivers() {
  const response = await fetch('/api/drivers');
  drivers = await response.json();
  selectedDriverId = drivers[0] ? drivers[0].id : '';
  renderTable();
}

function addDriver() {
  const next = {
    id: randomId(),
    name: 'New Driver',
    folder: 'New Driver'
  };
  drivers.push(next);
  selectedDriverId = next.id;
  renderTable();
  adminStatus.textContent = 'Driver row added. Edit values and save.';
}

function removeDriver() {
  if (!selectedDriverId) {
    adminStatus.textContent = 'Select a driver row first.';
    return;
  }

  drivers = drivers.filter(driver => driver.id !== selectedDriverId);
  selectedDriverId = drivers[0] ? drivers[0].id : '';
  renderTable();
  adminStatus.textContent = 'Selected driver removed locally. Save to confirm.';
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
    body: JSON.stringify(drivers)
  });

  if (!response.ok) {
    adminStatus.textContent = 'Save failed. Check admin key.';
    return;
  }

  adminStatus.textContent = 'Drivers saved to backend.';
}

addDriverBtn.addEventListener('click', addDriver);
removeDriverBtn.addEventListener('click', removeDriver);
saveDriversBtn.addEventListener('click', saveDrivers);

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadDrivers();
  adminStatus.textContent = 'Drivers loaded.';
});
