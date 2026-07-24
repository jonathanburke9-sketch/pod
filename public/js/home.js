const adminNav = document.getElementById('adminNav');
const staffBadge = document.getElementById('staffBadge');
const setupStaff = document.getElementById('setupStaff');
const staffPicker = document.getElementById('staffPicker');
const bindStaffBtn = document.getElementById('bindStaffBtn');
const staffStatus = document.getElementById('staffStatus');
const functionGrid = document.getElementById('functionGrid');

let settings = null;
let staffMembers = [];
let boundStaffId = localStorage.getItem('pod-device-driver') || '';

function getActiveTheme(settingsObj) {
  const presetKey = settingsObj.activeThemePreset;
  const preset = settingsObj.themePresets && settingsObj.themePresets[presetKey];
  if (preset) return preset;
  return settingsObj.theme || settingsObj.themePresets?.ocean || {};
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.style.setProperty('--bg', theme.bg || '#060606');
  root.style.setProperty('--bg-spot-1', theme.bgSpot1 || 'rgba(226, 31, 43, 0.28)');
  root.style.setProperty('--bg-spot-2', theme.bgSpot2 || 'rgba(217, 31, 111, 0.26)');
  root.style.setProperty('--bg-spot-3', theme.bgSpot3 || 'rgba(146, 204, 56, 0.2)');
  root.style.setProperty('--bg-spot-4', theme.bgSpot4 || 'rgba(0, 119, 200, 0.22)');
  root.style.setProperty('--panel', theme.panel || 'rgba(18, 18, 18, 0.88)');
  root.style.setProperty('--accent', theme.accent || '#d91f6f');
  root.style.setProperty('--accent-2', theme.accent2 || '#f35a1f');
  root.style.setProperty('--accent-3', theme.accent3 || theme.accent2 || '#f35a1f');
  root.style.setProperty('--accent-4', theme.accent4 || theme.accent2 || '#f35a1f');
  root.style.setProperty('--text', theme.text || '#f8fafc');
  root.style.setProperty('--muted', theme.muted || '#d6d6d6');
  root.style.setProperty('--border', theme.border || 'rgba(255, 255, 255, 0.14)');
  root.style.setProperty('--form-bg', theme.formBg || '#121212');
  root.style.setProperty('--form-text', theme.formText || '#f8fafc');
  root.style.setProperty('--secondary-button-bg', theme.secondaryButtonBg || '#1a1a1a');
}

function getFallbackFunctions() {
  return ['pod-sb', 'pod-just', 'receipt-sb', 'receipt-just'];
}

function getBoundStaff() {
  return staffMembers.find(member => member.id === boundStaffId) || null;
}

function getFunctionDefinitions() {
  const configured = Array.isArray(settings?.functions) ? settings.functions : [];
  return configured.length ? configured : [
    { code: 'pod-sb', label: 'POD-SB', cardHint: 'Current flow', colorClass: 'fn-pod-sb' },
    { code: 'pod-just', label: 'POD-Just', cardHint: 'Alt POD fields', colorClass: 'fn-pod-just' },
    { code: 'receipt-sb', label: 'Receipt-SB', cardHint: 'Receipt capture', colorClass: 'fn-receipt-sb' },
    { code: 'receipt-just', label: 'Receipt-Just', cardHint: 'Receipt alt fields', colorClass: 'fn-receipt-just' }
  ];
}

function getAllowedFunctionCodes(member) {
  const source = Array.isArray(member?.functions) && member.functions.length
    ? member.functions
    : getFallbackFunctions();
  return source.map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
}

function renderStaffOptions() {
  staffPicker.innerHTML = '';
  staffMembers.forEach(member => {
    const option = document.createElement('option');
    option.value = member.id;
    option.textContent = member.name;
    staffPicker.appendChild(option);
  });

  if (boundStaffId && staffMembers.some(member => member.id === boundStaffId)) {
    staffPicker.value = boundStaffId;
  }
}

function renderStaffState() {
  const boundStaff = getBoundStaff();
  if (boundStaff) {
    staffBadge.textContent = boundStaff.name;
    setupStaff.classList.add('hidden');
    staffStatus.textContent = `Device linked to ${boundStaff.name}. Choose a function.`;
  } else {
    staffBadge.textContent = 'Not linked yet';
    setupStaff.classList.remove('hidden');
    staffStatus.textContent = 'Lock a staff member, then choose a function.';
  }

  const isAdminDevice = Boolean(boundStaff && (boundStaff.folder || '').trim().toLowerCase() === 'jonathan-admin');
  adminNav.classList.toggle('hidden', !isAdminDevice);
}

function renderFunctionCards() {
  const boundStaff = getBoundStaff();
  const allowedCodes = getAllowedFunctionCodes(boundStaff);
  const cards = functionGrid.querySelectorAll('[data-function-code]');

  cards.forEach(card => {
    const code = String(card.dataset.functionCode || '').toLowerCase();
    const allowed = Boolean(boundStaff && allowedCodes.includes(code));
    card.disabled = !allowed;
    card.classList.toggle('locked', !allowed);

    const hint = card.querySelector('span');
    if (!boundStaff) {
      hint.textContent = 'Link staff first';
    } else if (!allowed) {
      hint.textContent = 'Disabled for this staff member';
    } else {
      const config = getFunctionDefinitions().find(item => item.code === code);
      hint.textContent = config?.cardHint || 'Open function';
    }
  });
}

function bindStaffToDevice() {
  const selectedStaffId = staffPicker.value;
  if (!selectedStaffId) {
    staffStatus.textContent = 'Select a staff member before locking this device.';
    return;
  }

  if (boundStaffId) {
    staffStatus.textContent = 'This device is already linked to a staff member.';
    return;
  }

  boundStaffId = selectedStaffId;
  localStorage.setItem('pod-device-driver', selectedStaffId);
  renderStaffState();
  renderFunctionCards();
}

function openFunction(functionCode) {
  const boundStaff = getBoundStaff();
  if (!boundStaff) {
    staffStatus.textContent = 'Lock a staff member before choosing a function.';
    return;
  }

  const allowed = getAllowedFunctionCodes(boundStaff);
  if (!allowed.includes(functionCode)) {
    staffStatus.textContent = 'This function is disabled for your staff profile.';
    return;
  }

  localStorage.setItem('pod-selected-function', functionCode);
  window.location.href = `/capture.html?fn=${encodeURIComponent(functionCode)}`;
}

async function loadSettings() {
  try {
    const response = await fetch('/settings/app_settings.json');
    settings = await response.json();
    const homeTheme = settings?.homeTheme || getActiveTheme(settings);
    applyTheme(homeTheme);

    const title = document.getElementById('homeTitle');
    const subtitle = document.getElementById('homeSubtitle');
    const badge = document.getElementById('homeBadge');
    if (settings?.home) {
      title.textContent = settings.home.title || title.textContent;
      subtitle.textContent = settings.home.subtitle || '';
      badge.textContent = settings.home.badge || '';
      subtitle.classList.toggle('hidden', settings.home.showSubtitle === false || !subtitle.textContent.trim());
      badge.classList.toggle('hidden', settings.home.showBadge === false || !badge.textContent.trim());
    }
  } catch (error) {
    settings = null;
  }
}

async function loadStaff() {
  try {
    const response = await fetch('/api/drivers');
    const items = await response.json();
    staffMembers = Array.isArray(items) ? items : [];
  } catch (error) {
    staffMembers = [
      { id: 'driver-001', name: 'Jonathan (Admin)', folder: 'Jonathan-Admin', functions: getFallbackFunctions() }
    ];
  }
}

function renderConfiguredFunctionCards() {
  const definitions = getFunctionDefinitions();
  functionGrid.innerHTML = '';

  definitions.forEach(def => {
    const button = document.createElement('button');
    button.className = `function-card ${def.colorClass || ''}`.trim();
    if (def.cardGradient) {
      button.style.background = def.cardGradient;
    }
    button.dataset.functionCode = def.code;
    button.type = 'button';
    button.innerHTML = `<strong>${def.label || def.code}</strong><span>${def.cardHint || 'Open function'}</span>`;
    button.addEventListener('click', () => openFunction(String(def.code || '').toLowerCase()));
    functionGrid.appendChild(button);
  });
}

bindStaffBtn.addEventListener('click', bindStaffToDevice);

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadStaff();
  renderConfiguredFunctionCards();
  renderStaffOptions();
  renderStaffState();
  renderFunctionCards();
});
