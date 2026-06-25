import { api, API_BASE, getToken, clearToken, getStoredUser } from './api.js';
import { appState, VIEW_META, loadStorage, saveSettings } from './state.js';
import { createCameraModule } from './camera.js';
import { createLogModule } from './logs.js';
import { WS_BASE } from './api.js';

const els = {
  appShell: document.getElementById('appShell'),
  sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
  sidebarExpandBtn: document.getElementById('sidebarExpandBtn'),
  sidebarOverlay: document.getElementById('sidebarOverlay'),
  pageTitle: document.getElementById('pageTitle'),
  pageDesc: document.getElementById('pageDesc'),
  globalNotice: document.getElementById('globalNotice'),
  scanTickToast: document.getElementById('scanTickToast'),
  scanTickText: document.getElementById('scanTickText'),
  userBadge: document.getElementById('userBadge'),

  navItems: Array.from(document.querySelectorAll('.nav-item')),
  viewPanels: Array.from(document.querySelectorAll('[data-view-panel]')),

  cameraGrid: document.getElementById('cameraGrid'),
  cameraForm: document.getElementById('cameraForm'),
  cameraName: document.getElementById('cameraName'),
  cameraUrl: document.getElementById('cameraUrl'),

  focusPanel: document.getElementById('focusPanel'),
  focusTitle: document.getElementById('focusTitle'),
  focusMeta: document.getElementById('focusMeta'),
  focusCanvas: document.getElementById('focusCanvas'),
  focusPlaceholder: document.getElementById('focusPlaceholder'),
  focusCloseBtn: document.getElementById('focusCloseBtn'),
  focusFullscreenBtn: document.getElementById('focusFullscreenBtn'),

  cameraEditModal: document.getElementById('cameraEditModal'),
  cameraEditForm: document.getElementById('cameraEditForm'),
  cameraEditCameraId: document.getElementById('cameraEditCameraId'),
  cameraEditName: document.getElementById('cameraEditName'),
  cameraEditUrl: document.getElementById('cameraEditUrl'),
  cameraEditEnabled: document.getElementById('cameraEditEnabled'),
  cameraEditCancelBtn: document.getElementById('cameraEditCancelBtn'),
  cameraEditCloseBtn: document.getElementById('cameraEditCloseBtn'),

  sessionBody: document.getElementById('sessionBody'),
  plateBody: document.getElementById('plateBody'),
  mCamerasTotal: document.getElementById('mCamerasTotal'),
  mCamerasOn: document.getElementById('mCamerasOn'),
  mActive: document.getElementById('mActive'),
  mCheckin: document.getElementById('mCheckin'),
  mCheckout: document.getElementById('mCheckout'),
  mOccupancy: document.getElementById('mOccupancy'),
  mOccupancyBar: document.getElementById('mOccupancyBar'),
  mRevenue: document.getElementById('mRevenue'),
  overviewLotList: document.getElementById('overviewLotList'),

  historyActiveOnly: document.getElementById('historyActiveOnly'),
  historyLimit: document.getElementById('historyLimit'),
  historyRefreshBtn: document.getElementById('historyRefreshBtn'),
  historySessionBody: document.getElementById('historySessionBody'),
  historyPlateBody: document.getElementById('historyPlateBody'),
  sessionsSearch: document.getElementById('sessionsSearch'),
  platesSearch: document.getElementById('platesSearch'),
  platesRefreshBtn: document.getElementById('platesRefreshBtn'),

  reportsDays: document.getElementById('reportsDays'),
  reportsRefreshBtn: document.getElementById('reportsRefreshBtn'),
  rpRevenue: document.getElementById('rpRevenue'),
  rpSessions: document.getElementById('rpSessions'),
  rpAvgDuration: document.getElementById('rpAvgDuration'),
  rpPeakHour: document.getElementById('rpPeakHour'),
  dailyChartCanvas: document.getElementById('dailyChartCanvas'),
  hourChartCanvas: document.getElementById('hourChartCanvas'),
  logHours: document.getElementById('logHours'),
  logLimit: document.getElementById('logLimit'),
  logAutoRefresh: document.getElementById('logAutoRefresh'),
  logRefreshBtn: document.getElementById('logRefreshBtn'),
  logBody: document.getElementById('logBody'),

  rfidForm: document.getElementById('rfidForm'),
  rfidCard: document.getElementById('rfidCard'),
  rfidDirection: document.getElementById('rfidDirection'),
  rfidLot: document.getElementById('rfidLot'),
  rfidPlate: document.getElementById('rfidPlate'),
  rfidSource: document.getElementById('rfidSource'),
  rfidLogBody: document.getElementById('rfidLogBody'),

  rfidCardForm: document.getElementById('rfidCardForm'),
  rfidCardId: document.getElementById('rfidCardId'),
  rfidCardPlate: document.getElementById('rfidCardPlate'),
  rfidCardOwner: document.getElementById('rfidCardOwner'),
  rfidCardBody: document.getElementById('rfidCardBody'),
  lotForm: document.getElementById('lotForm'),
  lotFormTitle: document.getElementById('lotFormTitle'),
  lotEditId: document.getElementById('lotEditId'),
  lotName: document.getElementById('lotName'),
  lotCapacity: document.getElementById('lotCapacity'),
  lotEntryCamera: document.getElementById('lotEntryCamera'),
  lotExitCamera: document.getElementById('lotExitCamera'),
  lotIsActive: document.getElementById('lotIsActive'),
  lotSubmitBtn: document.getElementById('lotSubmitBtn'),
  lotCancelEditBtn: document.getElementById('lotCancelEditBtn'),
  lotBody: document.getElementById('lotBody'),
  snapshotLotFilter: document.getElementById('snapshotLotFilter'),
  snapshotRefreshBtn: document.getElementById('snapshotRefreshBtn'),
  snapshotBody: document.getElementById('snapshotBody'),
  lotDetailTitle: document.getElementById('lotDetailTitle'),
  lotDetailMeta: document.getElementById('lotDetailMeta'),
  lotDetailCloseBtn: document.getElementById('lotDetailCloseBtn'),
  lotEntryCanvas: document.getElementById('lotEntryCanvas'),
  lotEntryPlaceholder: document.getElementById('lotEntryPlaceholder'),
  lotExitCanvas: document.getElementById('lotExitCanvas'),
  lotExitPlaceholder: document.getElementById('lotExitPlaceholder'),
  lotEntryCaptureImg: document.getElementById('lotEntryCaptureImg'),
  lotExitCaptureImg: document.getElementById('lotExitCaptureImg'),
  lotEntryCaptureStatus: document.getElementById('lotEntryCaptureStatus'),
  lotExitCaptureStatus: document.getElementById('lotExitCaptureStatus'),
  lotDetailLogBody: document.getElementById('lotDetailLogBody'),

  aiUploadForm: document.getElementById('aiUploadForm'),
  aiModelFile: document.getElementById('aiModelFile'),
  aiStatusText: document.getElementById('aiStatusText'),
  aiModelsList: document.getElementById('aiModelsList'),
  aiTestForm: document.getElementById('aiTestForm'),
  aiCameraSelect: document.getElementById('aiCameraSelect'),
  aiTestResult: document.getElementById('aiTestResult'),

  userStateText: document.getElementById('userStateText'),
  logoutBtn: document.getElementById('logoutBtn'),
  changePwForm: document.getElementById('changePwForm'),
  cpOld: document.getElementById('cpOld'),
  cpNew: document.getElementById('cpNew'),
  cpConfirm: document.getElementById('cpConfirm'),
  cpError: document.getElementById('cpError'),
  resetPwForm: document.getElementById('resetPwForm'),
  resetUser: document.getElementById('resetUser'),
  resetNew: document.getElementById('resetNew'),
  resetError: document.getElementById('resetError'),

  settingsForm: document.getElementById('settingsForm'),
  refreshSeconds: document.getElementById('refreshSeconds'),
  autoRefresh: document.getElementById('autoRefresh'),
  apiBaseReadonly: document.getElementById('apiBaseReadonly'),

  healthCheckBtn: document.getElementById('healthCheckBtn'),
  healthResult: document.getElementById('healthResult')
};

let noticeTimeout = null;
let scanTickTimeout = null;
let mainPoll = null;
let cameraPoll = null;
const lotDetailState = {
  selectedLotId: null,
  entryWs: null,
  exitWs: null,
  sharedWs: null,
  // Track which camera each live socket is bound to so periodic refreshes
  // don't tear down and reopen the stream (which caused the frame to blink).
  streamEntryCamId: null,
  streamExitCamId: null,
  streamSharedCamId: null
};
const captureStatusTimers = {
  entry: null,
  exit: null
};
const lastCapturePulseKeys = {
  entry: null,
  exit: null
};
const seenCaptureEventKeys = new Set();

function isMobileViewport() {
  return window.matchMedia('(max-width: 1180px)').matches;
}

function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('vi-VN', { hour12: false });
}

function absoluteApiUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE}${path}`;
}

function fmtMoney(amount, currency = '') {
  const n = Number(amount || 0);
  return `${n.toLocaleString('vi-VN')}${currency ? ' ' + currency : ''}`;
}

function fmtDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes || 0)));
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h${String(rem).padStart(2, '0')}` : `${h}h`;
}

function absoluteApiUrlNoCache(path) {
  const base = absoluteApiUrl(path);
  if (!base) return '';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}_ts=${Date.now()}`;
}

function notify(message, type = 'info') {
  els.globalNotice.textContent = message;
  els.globalNotice.className = `notice ${type === 'info' ? '' : type}`.trim();

  if (noticeTimeout) {
    clearTimeout(noticeTimeout);
  }
  if (type !== 'error') {
    noticeTimeout = setTimeout(() => {
      els.globalNotice.className = 'notice';
    }, 2800);
  }
}

function showScanTick(message = 'Quét RFID thành công') {
  if (!els.scanTickToast || !els.scanTickText) return;
  if (els.scanTickToast.parentElement !== document.body) {
    document.body.appendChild(els.scanTickToast);
  }
  els.scanTickToast.style.position = 'fixed';
  els.scanTickToast.style.top = '14px';
  els.scanTickToast.style.right = '14px';
  els.scanTickToast.style.bottom = 'auto';
  els.scanTickToast.style.left = 'auto';
  els.scanTickToast.style.zIndex = '99999';
  els.scanTickText.textContent = message;
  els.scanTickToast.classList.add('is-show');
  els.scanTickToast.setAttribute('aria-hidden', 'false');

  if (scanTickTimeout) {
    clearTimeout(scanTickTimeout);
  }
  scanTickTimeout = setTimeout(() => {
    els.scanTickToast.classList.remove('is-show');
    els.scanTickToast.setAttribute('aria-hidden', 'true');
  }, 1800);
}

function renderUserState() {
  const isLogged = Boolean(appState.user.username);
  els.userBadge.textContent = isLogged ? `User: ${appState.user.username}` : 'Guest';
  els.userStateText.textContent = isLogged
    ? `Đang đăng nhập bằng tài khoản: ${appState.user.username}`
    : 'Chưa đăng nhập.';
  els.logoutBtn.disabled = !isLogged;
}

function applySettingsToForm() {
  els.refreshSeconds.value = String(appState.settings.refreshSeconds);
  els.autoRefresh.checked = appState.settings.autoRefresh;
  els.apiBaseReadonly.value = API_BASE;
}

function applySidebarUiState() {
  const mobile = isMobileViewport();
  if (mobile) {
    els.appShell.classList.remove('sidebar-hidden');
    const isOpen = els.appShell.classList.contains('sidebar-mobile-open');
    const toggleLabel = isOpen ? 'Đóng menu' : 'Mở menu';
    els.sidebarToggleBtn.setAttribute('aria-label', toggleLabel);
    els.sidebarToggleBtn.setAttribute('title', toggleLabel);
    els.sidebarToggleBtn.setAttribute('aria-expanded', String(isOpen));
    els.sidebarExpandBtn.setAttribute('title', 'Mở menu');
    return;
  }

  els.appShell.classList.remove('sidebar-mobile-open');
  els.appShell.classList.toggle('sidebar-hidden', appState.settings.sidebarCollapsed);
  const collapsed = appState.settings.sidebarCollapsed;
  const toggleLabel = collapsed ? 'Hiện menu' : 'Ẩn menu';
  els.sidebarToggleBtn.setAttribute('aria-label', toggleLabel);
  els.sidebarToggleBtn.setAttribute('title', toggleLabel);
  els.sidebarToggleBtn.setAttribute('aria-expanded', String(!collapsed));
  els.sidebarExpandBtn.setAttribute('title', 'Mở menu');
}

function toggleSidebar() {
  if (isMobileViewport()) {
    els.appShell.classList.toggle('sidebar-mobile-open');
    applySidebarUiState();
    return;
  }

  appState.settings.sidebarCollapsed = !appState.settings.sidebarCollapsed;
  saveSettings(appState);
  applySidebarUiState();
}

function closeSidebarMobile() {
  if (!isMobileViewport()) return;
  els.appShell.classList.remove('sidebar-mobile-open');
  applySidebarUiState();
}

function isAuthenticated() {
  return Boolean(getToken());
}

function goToLogin() {
  window.location.replace('/login');
}

function renderAiCameraOptions() {
  const selected = els.aiCameraSelect.value;
  els.aiCameraSelect.innerHTML = '';

  if (!appState.cameras.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Chưa có camera';
    els.aiCameraSelect.appendChild(option);
    return;
  }

  for (const camera of appState.cameras) {
    const option = document.createElement('option');
    option.value = String(camera.id);
    option.textContent = `${camera.name} (#${camera.id})`;
    els.aiCameraSelect.appendChild(option);
  }

  if (selected && appState.cameras.some((x) => String(x.id) === selected)) {
    els.aiCameraSelect.value = selected;
  }
}

async function refreshDashboard() {
  const summary = await api('/api/v1/dashboard/summary');
  els.mCamerasTotal.textContent = summary.cameras_total;
  els.mCamerasOn.textContent = summary.cameras_enabled;
  els.mActive.textContent = summary.active_sessions;
  els.mCheckin.textContent = summary.today_checkins;
  els.mCheckout.textContent = summary.today_checkouts;

  const rate = Number(summary.occupancy_rate || 0);
  if (els.mOccupancy) {
    els.mOccupancy.textContent = `${rate}%`;
  }
  if (els.mOccupancyBar) {
    els.mOccupancyBar.style.width = `${Math.min(100, rate)}%`;
  }
  if (els.mRevenue) {
    els.mRevenue.textContent = fmtMoney(summary.today_revenue, summary.currency);
  }
}

async function refreshActiveSessions() {
  const sessions = await api('/api/v1/sessions?active_only=true&limit=20');
  els.sessionBody.innerHTML = '';

  if (!sessions.length) {
    els.sessionBody.innerHTML = '<tr><td colspan="4" class="empty">Chưa có xe đang gửi</td></tr>';
    return;
  }

  for (const row of sessions) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.id}</td>
      <td>${row.plate || '-'}</td>
      <td>${row.rfid_card}</td>
      <td>${fmtDate(row.entry_time)}</td>
    `;
    els.sessionBody.appendChild(tr);
  }
}

async function refreshRecentPlates() {
  const plates = await api('/api/v1/plates?limit=25');
  els.plateBody.innerHTML = '';

  if (!plates.length) {
    els.plateBody.innerHTML = '<tr><td colspan="4" class="empty">Chưa có biển số nào được nhận diện</td></tr>';
    return;
  }

  for (const row of plates) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(row.seen_at)}</td>
      <td>${row.camera_name}</td>
      <td>${row.plate}</td>
      <td>${row.linked ? 'Yes' : 'No'}</td>
    `;
    els.plateBody.appendChild(tr);
  }
}

let allSessions = [];
let allPlates = [];

function renderSessionsTable() {
  const q = (els.sessionsSearch?.value || '').trim().toLowerCase();
  const rows = q
    ? allSessions.filter((r) =>
        (r.plate || '').toLowerCase().includes(q) || (r.rfid_card || '').toLowerCase().includes(q))
    : allSessions;

  els.historySessionBody.innerHTML = '';
  if (!rows.length) {
    els.historySessionBody.innerHTML = '<tr><td colspan="8" class="empty">Không có dữ liệu phiên xe</td></tr>';
    return;
  }
  for (const row of rows) {
    const statusChip = row.status === 'in'
      ? '<span class="chip chip-in">Đang gửi</span>'
      : '<span class="chip chip-out">Đã ra</span>';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.id}</td>
      <td>${row.plate || '-'}</td>
      <td>${row.rfid_card}</td>
      <td>${fmtDate(row.entry_time)}</td>
      <td>${fmtDate(row.exit_time)}</td>
      <td>${fmtDuration(row.duration_minutes)}</td>
      <td class="fee-val">${fmtMoney(row.fee, row.currency)}</td>
      <td>${statusChip}</td>
    `;
    els.historySessionBody.appendChild(tr);
  }
}

function renderPlatesTable() {
  const q = (els.platesSearch?.value || '').trim().toLowerCase();
  const rows = q
    ? allPlates.filter((r) =>
        (r.plate || '').toLowerCase().includes(q) || (r.camera_name || '').toLowerCase().includes(q))
    : allPlates;

  els.historyPlateBody.innerHTML = '';
  if (!rows.length) {
    els.historyPlateBody.innerHTML = '<tr><td colspan="5" class="empty">Không có dữ liệu nhận diện</td></tr>';
    return;
  }
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(row.seen_at)}</td>
      <td>${row.camera_name}</td>
      <td>${row.plate}</td>
      <td>${row.confidence == null ? '-' : row.confidence.toFixed(3)}</td>
      <td>${row.linked ? '<span class="chip chip-in">Yes</span>' : '<span class="chip chip-out">No</span>'}</td>
    `;
    els.historyPlateBody.appendChild(tr);
  }
}

async function refreshSessions() {
  const limit = Number(els.historyLimit.value || 50);
  const activeOnly = els.historyActiveOnly.checked;
  allSessions = await api(`/api/v1/sessions?active_only=${activeOnly}&limit=${limit}`);
  renderSessionsTable();
}

async function refreshPlates() {
  const limit = Number(els.historyLimit?.value || 50);
  allPlates = await api(`/api/v1/plates?limit=${limit}`);
  renderPlatesTable();
}

function renderRfidLogs() {
  els.rfidLogBody.innerHTML = '';
  if (!appState.rfidLogs.length) {
    els.rfidLogBody.innerHTML = '<tr><td colspan="4" class="empty">Chưa có log RFID</td></tr>';
    return;
  }

  for (const item of appState.rfidLogs) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(item.at)}</td>
      <td>${item.card_id}</td>
      <td>${item.status}</td>
      <td>${item.plate || '-'}</td>
    `;
    els.rfidLogBody.appendChild(tr);
  }
}

function cameraNameById(cameraId) {
  const cam = appState.cameras.find((x) => x.id === cameraId);
  return cam ? `${cam.name} (#${cam.id})` : '-';
}

function renderLotCameraOptions() {
  const makeOptions = (selectEl, selectedValue = '') => {
    selectEl.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Không chỉ định';
    selectEl.appendChild(none);
    for (const cam of appState.cameras) {
      const opt = document.createElement('option');
      opt.value = String(cam.id);
      opt.textContent = `${cam.name} (#${cam.id})`;
      selectEl.appendChild(opt);
    }
    if (selectedValue) {
      selectEl.value = selectedValue;
    }
  };

  makeOptions(els.lotEntryCamera, els.lotEntryCamera.value);
  makeOptions(els.lotExitCamera, els.lotExitCamera.value);
}

function resetLotForm() {
  els.lotEditId.value = '';
  els.lotFormTitle.textContent = 'Tạo bãi xe';
  els.lotSubmitBtn.textContent = 'Lưu bãi xe';
  els.lotForm.reset();
  els.lotIsActive.checked = true;
  if (els.lotCapacity) els.lotCapacity.value = '50';
}

function fillLotFormForEdit(lot) {
  els.lotEditId.value = String(lot.id);
  els.lotFormTitle.textContent = `Sửa bãi xe #${lot.id}`;
  els.lotSubmitBtn.textContent = 'Cập nhật bãi xe';
  els.lotName.value = lot.name;
  if (els.lotCapacity) els.lotCapacity.value = String(lot.capacity ?? 50);
  els.lotEntryCamera.value = lot.entry_camera_id ? String(lot.entry_camera_id) : '';
  els.lotExitCamera.value = lot.exit_camera_id ? String(lot.exit_camera_id) : '';
  els.lotIsActive.checked = Boolean(lot.is_active);
}

function renderLotFilterOptions(lots) {
  els.snapshotLotFilter.innerHTML = '';
  els.rfidLot.innerHTML = '';

  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'Tất cả bãi xe';
  els.snapshotLotFilter.appendChild(allOpt);

  const defaultLotOpt = document.createElement('option');
  defaultLotOpt.value = '';
  defaultLotOpt.textContent = 'Bãi mặc định (active)';
  els.rfidLot.appendChild(defaultLotOpt);

  for (const lot of lots) {
    const opt = document.createElement('option');
    opt.value = String(lot.id);
    opt.textContent = `${lot.name} (#${lot.id})`;
    els.snapshotLotFilter.appendChild(opt);

    const lotOpt = document.createElement('option');
    lotOpt.value = String(lot.id);
    lotOpt.textContent = `${lot.name} (#${lot.id})`;
    els.rfidLot.appendChild(lotOpt);
  }
}

function occRate(occupied, capacity) {
  const cap = Number(capacity || 0);
  if (cap <= 0) return 0;
  return Math.min(100, Math.round((Number(occupied || 0) / cap) * 100));
}

function occClass(rate) {
  if (rate >= 90) return 'is-high';
  if (rate >= 60) return 'is-mid';
  return '';
}

function renderOverviewLots(lots) {
  if (!els.overviewLotList) return;
  if (!lots || !lots.length) {
    els.overviewLotList.innerHTML = '<p class="empty">Chưa có bãi xe</p>';
    return;
  }
  els.overviewLotList.innerHTML = '';
  for (const lot of lots) {
    const occ = Number(lot.occupied || 0);
    const cap = Number(lot.capacity || 0);
    const rate = occRate(occ, cap);
    const row = document.createElement('div');
    row.className = 'occ-row';
    row.innerHTML = `
      <div class="occ-name">${lot.name}</div>
      <div class="occ-track"><div class="occ-fill ${occClass(rate)}" style="width:${rate}%"></div></div>
      <div class="occ-meta"><strong>${occ}</strong>/${cap} · ${rate}%</div>
    `;
    els.overviewLotList.appendChild(row);
  }
}

function renderParkingLots(lots) {
  els.lotBody.innerHTML = '';
  if (!lots.length) {
    els.lotBody.innerHTML = '<tr><td colspan="10" class="empty">Chưa có bãi xe</td></tr>';
    return;
  }

  for (const lot of lots) {
    const occ = Number(lot.occupied || 0);
    const cap = Number(lot.capacity || 0);
    const rate = occRate(occ, cap);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${lot.id}</td>
      <td>${lot.name}</td>
      <td>${cap}</td>
      <td style="min-width:140px">
        <div class="occ-track"><div class="occ-fill ${occClass(rate)}" style="width:${rate}%"></div></div>
        <span class="occ-meta">${occ}/${cap} · ${rate}%</span>
      </td>
      <td>${cameraNameById(lot.entry_camera_id)}</td>
      <td>${cameraNameById(lot.exit_camera_id)}</td>
      <td>${lot.is_active ? '<span class="chip chip-in">Active</span>' : '<span class="chip chip-out">Inactive</span>'}</td>
      <td><button class="ghost lot-manage-btn" data-lot-id="${lot.id}">Quản lý</button></td>
      <td><button class="ghost lot-edit-btn" data-lot-id="${lot.id}">Sửa</button></td>
      <td><button class="ghost lot-delete-btn" data-lot-id="${lot.id}">Xóa</button></td>
    `;
    els.lotBody.appendChild(tr);
  }

  for (const btn of els.lotBody.querySelectorAll('.lot-manage-btn')) {
    btn.addEventListener('click', async () => {
      const lotId = Number(btn.dataset.lotId);
      await openParkingLotDetail(lotId);
    });
  }

  for (const btn of els.lotBody.querySelectorAll('.lot-edit-btn')) {
    btn.addEventListener('click', () => {
      const lotId = Number(btn.dataset.lotId);
      const lot = appState.parkingLots.find((x) => x.id === lotId);
      if (!lot) return;
      fillLotFormForEdit(lot);
    });
  }

  for (const btn of els.lotBody.querySelectorAll('.lot-delete-btn')) {
    btn.addEventListener('click', async () => {
      const lotId = btn.dataset.lotId;
      if (!confirm(`Xóa bãi xe #${lotId}?`)) return;
      try {
        await api(`/api/v1/parking-lots/${lotId}`, { method: 'DELETE' });
        notify('Đã xóa bãi xe', 'success');
        await loadParkingLots();
        await refreshSnapshotList();
      } catch (err) {
        notify(`Xóa bãi xe lỗi: ${err.message}`, 'error');
      }
    });
  }
}

async function loadParkingLots() {
  const lots = await api('/api/v1/parking-lots');
  appState.parkingLots = lots;
  renderParkingLots(lots);
  renderLotFilterOptions(lots);
  renderOverviewLots(lots);
}

function closeLotWs(ws) {
  if (!ws) return null;
  // Drop handlers before closing so the onclose placeholder ("Mất kết nối
  // camera") doesn't flash when we intentionally tear the socket down.
  ws.onmessage = null;
  ws.onclose = null;
  ws.onerror = null;
  ws.close();
  return null;
}

function setLotPlaceholder(kind, text) {
  if (kind === 'entry') {
    els.lotEntryPlaceholder.textContent = text;
    els.lotEntryPlaceholder.style.display = 'block';
  } else {
    els.lotExitPlaceholder.textContent = text;
    els.lotExitPlaceholder.style.display = 'block';
  }
}

function openLotStream(kind, cameraId) {
  const canvas = kind === 'entry' ? els.lotEntryCanvas : els.lotExitCanvas;
  const placeholder = kind === 'entry' ? els.lotEntryPlaceholder : els.lotExitPlaceholder;
  const ctx = canvas.getContext('2d');
  canvas.width = 1280;
  canvas.height = 720;

  if (!cameraId) {
    setLotPlaceholder(kind, kind === 'entry' ? 'Chưa có camera vào' : 'Chưa có camera ra');
    return;
  }

  let pendingFrame = null;
  let decoding = false;
  let animFrameId = null;

  const ws = new WebSocket(`${WS_BASE}/ws/cameras/${cameraId}`);
  ws.binaryType = 'arraybuffer';

  async function consumeFrame() {
    animFrameId = null;
    if (decoding) return;
    decoding = true;

    const frame = pendingFrame;
    pendingFrame = null;

    if (frame) {
      const blob = new Blob([frame], { type: 'image/jpeg' });
      const bmp = await createImageBitmap(blob);
      placeholder.style.display = 'none';
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close();
    }

    decoding = false;

    if (pendingFrame && !decoding) {
      animFrameId = requestAnimationFrame(() => consumeFrame().catch(console.error));
    }
  }

  ws.onmessage = (ev) => {
    pendingFrame = ev.data;
    if (!decoding && !animFrameId) {
      animFrameId = requestAnimationFrame(() => consumeFrame().catch(console.error));
    }
  };

  ws.onclose = () => {
    pendingFrame = null;
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    setLotPlaceholder(kind, 'Mất kết nối camera');
  };

  if (kind === 'entry') {
    lotDetailState.entryWs = ws;
  } else {
    lotDetailState.exitWs = ws;
  }
}

function closeLotDetailStreams() {
  lotDetailState.sharedWs = closeLotWs(lotDetailState.sharedWs);
  lotDetailState.entryWs = closeLotWs(lotDetailState.entryWs);
  lotDetailState.exitWs = closeLotWs(lotDetailState.exitWs);
  lotDetailState.streamEntryCamId = null;
  lotDetailState.streamExitCamId = null;
  lotDetailState.streamSharedCamId = null;
}

// Only (re)connect the live sockets when the desired camera layout differs
// from what's already streaming, or a socket has died. This keeps periodic
// data refreshes from blinking the video.
function ensureLotStreams(lot) {
  const entryCam = lot.entry_camera_id || null;
  const exitCam = lot.exit_camera_id || null;
  const useShared = Boolean(entryCam && exitCam && entryCam === exitCam);

  const wsAlive = (ws) =>
    Boolean(ws) && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING);

  if (useShared) {
    const ok =
      lotDetailState.streamSharedCamId === entryCam &&
      wsAlive(lotDetailState.sharedWs) &&
      !lotDetailState.entryWs &&
      !lotDetailState.exitWs;
    if (ok) return;
  } else {
    const entryOk = entryCam
      ? lotDetailState.streamEntryCamId === entryCam && wsAlive(lotDetailState.entryWs)
      : !lotDetailState.entryWs;
    const exitOk = exitCam
      ? lotDetailState.streamExitCamId === exitCam && wsAlive(lotDetailState.exitWs)
      : !lotDetailState.exitWs;
    if (entryOk && exitOk && !lotDetailState.sharedWs) return;
  }

  closeLotDetailStreams();
  if (useShared) {
    openSharedLotStream(entryCam);
    lotDetailState.streamSharedCamId = entryCam;
  } else {
    openLotStream('entry', entryCam);
    openLotStream('exit', exitCam);
    lotDetailState.streamEntryCamId = entryCam;
    lotDetailState.streamExitCamId = exitCam;
  }
}

function openSharedLotStream(cameraId) {
  const entryCtx = els.lotEntryCanvas.getContext('2d');
  const exitCtx = els.lotExitCanvas.getContext('2d');
  els.lotEntryCanvas.width = 1280;
  els.lotEntryCanvas.height = 720;
  els.lotExitCanvas.width = 1280;
  els.lotExitCanvas.height = 720;

  let pendingFrame = null;
  let decoding = false;
  let animFrameId = null;

  const ws = new WebSocket(`${WS_BASE}/ws/cameras/${cameraId}`);
  ws.binaryType = 'arraybuffer';

  async function consumeFrame() {
    animFrameId = null;
    if (decoding) return;
    decoding = true;

    const frame = pendingFrame;
    pendingFrame = null;

    if (frame) {
      const blob = new Blob([frame], { type: 'image/jpeg' });
      const bmp = await createImageBitmap(blob);
      els.lotEntryPlaceholder.style.display = 'none';
      els.lotExitPlaceholder.style.display = 'none';
      entryCtx.drawImage(bmp, 0, 0, els.lotEntryCanvas.width, els.lotEntryCanvas.height);
      exitCtx.drawImage(bmp, 0, 0, els.lotExitCanvas.width, els.lotExitCanvas.height);
      bmp.close();
    }

    decoding = false;
    if (pendingFrame && !decoding) {
      animFrameId = requestAnimationFrame(() => consumeFrame().catch(() => null));
    }
  }

  ws.onmessage = (ev) => {
    pendingFrame = ev.data;
    if (!decoding && !animFrameId) {
      animFrameId = requestAnimationFrame(() => consumeFrame().catch(() => null));
    }
  };

  ws.onclose = () => {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    setLotPlaceholder('entry', 'Mất kết nối camera');
    setLotPlaceholder('exit', 'Mất kết nối camera');
  };

  lotDetailState.sharedWs = ws;
}

function renderLotDetailLogs(sessions) {
  els.lotDetailLogBody.innerHTML = '';
  const rows = [];
  for (const s of sessions) {
    rows.push({ at: s.entry_time, direction: 'in', plate: s.plate || '-', card: s.rfid_card, status: 'checked_in' });
    if (s.exit_time) {
      rows.push({ at: s.exit_time, direction: 'out', plate: s.plate || '-', card: s.rfid_card, status: 'checked_out' });
    }
  }
  rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (!rows.length) {
    els.lotDetailLogBody.innerHTML = '<tr><td colspan="5" class="empty">Chưa có log in/out cho bãi này</td></tr>';
    return;
  }

  for (let idx = 0; idx < rows.length; idx += 1) {
    const row = rows[idx];
    const tr = document.createElement('tr');
    const directionLabel = row.direction === 'in' ? 'IN' : 'OUT';
    const statusLabel = row.status === 'checked_in' ? 'Đang gửi' : 'Đã ra';
    tr.className = `lot-log-row ${idx % 2 === 0 ? 'lot-log-even' : 'lot-log-odd'}`;
    tr.innerHTML = `
      <td>${fmtDate(row.at)}</td>
      <td><span class="lot-log-chip ${row.direction === 'in' ? 'lot-log-chip-in' : 'lot-log-chip-out'}">${directionLabel}</span></td>
      <td>${row.plate}</td>
      <td>${row.card}</td>
      <td><span class="lot-log-chip ${row.status === 'checked_in' ? 'lot-log-chip-in' : 'lot-log-chip-out'}">${statusLabel}</span></td>
    `;
    els.lotDetailLogBody.appendChild(tr);
  }
}

function renderLotLatestCaptures(snapshots) {
  if (!snapshots || !snapshots.length) {
    els.lotEntryCaptureImg.src = '';
    els.lotExitCaptureImg.src = '';
    setCaptureStatusIdle();
    return;
  }

  const ordered = [...snapshots].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const latest = ordered[0];

  if (latest.direction === 'in') {
    // Xe vừa vào: chỉ cần hiển thị ảnh cam vào để bảo vệ xác nhận nhanh.
    els.lotEntryCaptureImg.src = latest.image_url ? absoluteApiUrlNoCache(latest.image_url) : '';
    els.lotExitCaptureImg.src = '';
    pulseCaptureStatus('entry', Boolean(latest.image_url), latest);
    setCaptureStatusChip(els.lotExitCaptureStatus, false, 'RFID ra');
    return;
  }

  if (latest.direction === 'out') {
    // Xe vừa ra: hiển thị cặp ảnh vào/ra của cùng session để so sánh.
    const pairedIn = ordered.find((x) => x.direction === 'in' && x.session_id === latest.session_id);
    els.lotEntryCaptureImg.src = pairedIn?.image_url ? absoluteApiUrlNoCache(pairedIn.image_url) : '';
    els.lotExitCaptureImg.src = latest.image_url ? absoluteApiUrlNoCache(latest.image_url) : '';
    setCaptureStatusChip(els.lotEntryCaptureStatus, false, 'RFID vào');
    pulseCaptureStatus('exit', Boolean(latest.image_url), latest);
    return;
  }

  els.lotEntryCaptureImg.src = '';
  els.lotExitCaptureImg.src = '';
  setCaptureStatusIdle();
}

function setCaptureStatusChip(el, ok, label) {
  if (!el) return;
  el.classList.remove('is-ok', 'is-off');
  el.classList.add(ok ? 'is-ok' : 'is-off');
  el.textContent = `${label}: ${ok ? 'quét RFID OK' : 'đang không quét'}`;
}

function pulseCaptureStatus(kind, ok, snapshot = null) {
  const target = kind === 'entry' ? els.lotEntryCaptureStatus : els.lotExitCaptureStatus;
  const label = kind === 'entry' ? 'RFID vào' : 'RFID ra';
  if (!ok) {
    setCaptureStatusChip(target, false, label);
    return;
  }
  const pulseKey = snapshot
    ? `${snapshot.session_id || '-'}:${snapshot.direction || '-'}:${snapshot.timestamp || '-'}:${snapshot.image_url || '-'}`
    : null;
  if (pulseKey && lastCapturePulseKeys[kind] === pulseKey) {
    return;
  }
  if (pulseKey) {
    lastCapturePulseKeys[kind] = pulseKey;
  }
  setCaptureStatusChip(target, true, label);
  if (captureStatusTimers[kind]) {
    clearTimeout(captureStatusTimers[kind]);
  }
  captureStatusTimers[kind] = setTimeout(() => {
    setCaptureStatusChip(target, false, label);
    captureStatusTimers[kind] = null;
  }, 2000);
}

function setCaptureStatusIdle() {
  if (captureStatusTimers.entry) {
    clearTimeout(captureStatusTimers.entry);
    captureStatusTimers.entry = null;
  }
  if (captureStatusTimers.exit) {
    clearTimeout(captureStatusTimers.exit);
    captureStatusTimers.exit = null;
  }
  lastCapturePulseKeys.entry = null;
  lastCapturePulseKeys.exit = null;
  setCaptureStatusChip(els.lotEntryCaptureStatus, false, 'RFID vào');
  setCaptureStatusChip(els.lotExitCaptureStatus, false, 'RFID ra');
}

async function openParkingLotDetail(lotId) {
  const data = await api(`/api/v1/parking-lots/${lotId}/overview?limit=100`);
  lotDetailState.selectedLotId = lotId;
  els.lotDetailTitle.textContent = `Chi tiết bãi xe: ${data.lot.name} (#${data.lot.id})`;
  els.lotDetailMeta.textContent = `Cam vào: ${cameraNameById(data.lot.entry_camera_id)} | Cam ra: ${cameraNameById(data.lot.exit_camera_id)}`;
  renderLotDetailLogs(data.sessions || []);
  renderLotLatestCaptures(data.snapshots || []);

  ensureLotStreams(data.lot);
}

async function refreshSnapshotList() {
  const lotId = els.snapshotLotFilter.value;
  const query = lotId ? `?lot_id=${lotId}&limit=100` : '?limit=100';
  const rows = await api(`/api/v1/snapshots${query}`);

  els.snapshotBody.innerHTML = '';
  if (!rows.length) {
    els.snapshotBody.innerHTML = '<tr><td colspan="7" class="empty">Chưa có ảnh snapshot</td></tr>';
    return;
  }

  for (const row of rows) {
    const lotName = appState.parkingLots?.find((x) => x.id === row.lot_id)?.name || (row.lot_id ? `#${row.lot_id}` : '-');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(row.timestamp)}</td>
      <td>${lotName}</td>
      <td>${row.direction}</td>
      <td>${row.plate}</td>
      <td>${row.rfid_card}</td>
      <td>${cameraNameById(row.camera_id)}</td>
      <td><a href="${absoluteApiUrl(row.image_url)}" target="_blank" rel="noopener">Xem ảnh</a></td>
    `;
    els.snapshotBody.appendChild(tr);
  }
}

async function refreshRfidEventLogs() {
  try {
    const logs = await api('/api/v1/logs?hours=24&limit=50');
    const mapped = [];

    for (const row of logs) {
      if (row.type !== 'rfid_in' && row.type !== 'rfid_out' && row.type !== 'session_in' && row.type !== 'session_out') {
        continue;
      }

      const details = row.details || {};
      const snapshotUrl = details.exit_snapshot_url || details.entry_snapshot_url || null;
      if ((row.type === 'session_in' || row.type === 'session_out') && snapshotUrl) {
        const key = `${row.type}:${details.session_id || '-'}:${snapshotUrl}`;
        if (!seenCaptureEventKeys.has(key)) {
          seenCaptureEventKeys.add(key);
          showScanTick(`RFID ${row.type === 'session_in' ? 'vào' : 'ra'} thành công`);
          notify(`RFID ${row.type === 'session_in' ? 'vào' : 'ra'} đã capture ảnh`, 'success');
        }
      }

      mapped.push({
        at: row.timestamp,
        card_id: details.card_id || details.rfid_card || '-',
        status: row.type,
        plate: details.plate || '-',
      });

      if (mapped.length >= 30) break;
    }

    appState.rfidLogs = mapped;
    renderRfidLogs();
  } catch (err) {
    if (appState.currentView === 'rfid') {
      notify(`RFID logs lỗi: ${err.message}`, 'warn');
    }
  }
}

async function loadRfidCards() {
  try {
    const cards = await api('/api/v1/rfid/cards');
    appState.rfidCards = cards;
    renderRfidCards();
  } catch (err) {
    notify(`Load RFID cards lỗi: ${err.message}`, 'error');
  }
}

function renderRfidCards() {
  els.rfidCardBody.innerHTML = '';
  if (!appState.rfidCards || !appState.rfidCards.length) {
    els.rfidCardBody.innerHTML = '<tr><td colspan="5" class="empty">Chưa có thẻ RFID nào được đăng ký</td></tr>';
    return;
  }

  for (const card of appState.rfidCards) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${card.card_id}</td>
      <td>${card.plate}</td>
      <td>${card.owner_name || '-'}</td>
      <td>${card.is_active ? 'Hoạt động' : 'Khóa'}</td>
      <td><button class="ghost delete-card-btn" data-card-id="${card.card_id}">Xóa</button></td>
    `;
    els.rfidCardBody.appendChild(tr);
  }

  // Bind delete buttons
  const deleteBtns = els.rfidCardBody.querySelectorAll('.delete-card-btn');
  for (const btn of deleteBtns) {
    btn.addEventListener('click', async () => {
      const cardId = btn.dataset.cardId;
      if (!confirm(`Xóa thẻ ${cardId}?`)) return;
      try {
        await api(`/api/v1/rfid/cards/${cardId}`, { method: 'DELETE' });
        notify('Xóa thẻ thành công', 'success');
        await loadRfidCards();
      } catch (err) {
        notify(`Xóa thẻ lỗi: ${err.message}`, 'error');
      }
    });
  }
}

async function refreshAiStatus() {
  try {
    const data = await api('/api/v1/ai/status');
    els.aiStatusText.textContent = `Recognizer: ${data.recognizer_name} | Models dir: ${data.models_dir}`;
    els.aiModelsList.innerHTML = '';

    if (!data.uploaded_models.length) {
      const li = document.createElement('li');
      li.textContent = 'Chưa có model nào được upload';
      els.aiModelsList.appendChild(li);
      return;
    }

    for (const model of data.uploaded_models) {
      const li = document.createElement('li');
      li.textContent = model;
      els.aiModelsList.appendChild(li);
    }
  } catch (err) {
    els.aiStatusText.textContent = `AI API chưa sẵn sàng: ${err.message}`;
    els.aiModelsList.innerHTML = '';
    const li = document.createElement('li');
    li.textContent = 'Không thể tải danh sách model';
    els.aiModelsList.appendChild(li);
  }
}

// ---- Reports / charts ----
const CHART_HEIGHT = 240;

function prepareCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
  const cssH = CHART_HEIGHT; // fixed logical height (also set in CSS)
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  return { ctx, w: cssW, h: cssH };
}

function drawAxes(ctx, w, h, pad, maxVal) {
  ctx.strokeStyle = 'rgba(148,173,211,0.18)';
  ctx.fillStyle = '#8d9cb5';
  ctx.font = '11px Inter, Segoe UI, sans-serif';
  ctx.lineWidth = 1;
  const steps = 4;
  for (let i = 0; i <= steps; i += 1) {
    const y = pad.top + (h - pad.top - pad.bottom) * (i / steps);
    const val = Math.round(maxVal * (1 - i / steps));
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillText(String(val), 6, y + 3);
  }
}

function drawGroupedBars(canvas, labels, seriesA, seriesB) {
  if (!canvas) return;
  const { ctx, w, h } = prepareCanvas(canvas);
  const pad = { top: 12, right: 12, bottom: 26, left: 30 };
  const maxVal = Math.max(1, ...seriesA, ...seriesB);
  drawAxes(ctx, w, h, pad, maxVal);

  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const groupW = plotW / labels.length;
  const barW = Math.max(3, Math.min(16, groupW / 3));

  for (let i = 0; i < labels.length; i += 1) {
    const cx = pad.left + groupW * i + groupW / 2;
    const aH = (seriesA[i] / maxVal) * plotH;
    const bH = (seriesB[i] / maxVal) * plotH;
    ctx.fillStyle = '#2dd4bf';
    ctx.fillRect(cx - barW - 1, pad.top + plotH - aH, barW, aH);
    ctx.fillStyle = '#4f86ff';
    ctx.fillRect(cx + 1, pad.top + plotH - bH, barW, bH);
    if (labels.length <= 16 || i % 2 === 0) {
      ctx.fillStyle = '#8d9cb5';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], cx, h - 8);
      ctx.textAlign = 'left';
    }
  }
}

function drawBars(canvas, labels, values, color) {
  if (!canvas) return;
  const { ctx, w, h } = prepareCanvas(canvas);
  const pad = { top: 12, right: 12, bottom: 26, left: 30 };
  const maxVal = Math.max(1, ...values);
  drawAxes(ctx, w, h, pad, maxVal);

  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const slot = plotW / values.length;
  const barW = Math.max(3, slot * 0.62);

  for (let i = 0; i < values.length; i += 1) {
    const cx = pad.left + slot * i + slot / 2;
    const bH = (values[i] / maxVal) * plotH;
    ctx.fillStyle = color;
    ctx.fillRect(cx - barW / 2, pad.top + plotH - bH, barW, bH);
    if (i % 2 === 0) {
      ctx.fillStyle = '#8d9cb5';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], cx, h - 8);
      ctx.textAlign = 'left';
    }
  }
}

let lastStats = null;

function renderReports(stats) {
  lastStats = stats;
  els.rpRevenue.textContent = fmtMoney(stats.total_revenue, stats.currency);
  els.rpSessions.textContent = stats.total_sessions;
  els.rpAvgDuration.textContent = fmtDuration(stats.avg_duration_minutes);

  let peakHour = 0;
  let peakVal = -1;
  stats.by_hour.forEach((v, h) => {
    if (v > peakVal) { peakVal = v; peakHour = h; }
  });
  els.rpPeakHour.textContent = peakVal > 0 ? `${String(peakHour).padStart(2, '0')}:00` : '-';

  const dailyLabels = stats.daily.map((d) => d.date.slice(5)); // MM-DD
  drawGroupedBars(
    els.dailyChartCanvas,
    dailyLabels,
    stats.daily.map((d) => d.checkins),
    stats.daily.map((d) => d.checkouts)
  );
  const hourLabels = stats.by_hour.map((_, h) => String(h));
  drawBars(els.hourChartCanvas, hourLabels, stats.by_hour, '#4f86ff');
}

async function refreshReports() {
  const days = Number(els.reportsDays?.value || 7);
  const stats = await api(`/api/v1/dashboard/stats?days=${days}`);
  renderReports(stats);
}

async function runHealthCheck(showNotice = true) {
  const started = new Date().toISOString();
  const data = await api('/health');
  els.healthResult.textContent = JSON.stringify({ checked_at: started, api_base: API_BASE, result: data }, null, 2);
  if (showNotice) {
    notify('Backend health OK', 'success');
  }
}

async function onCameraMutated() {
  await Promise.all([refreshDashboard(), refreshActiveSessions(), refreshRecentPlates()]);
  if (appState.currentView === 'sessions') {
    await refreshSessions();
  }
  if (appState.currentView === 'plates') {
    await refreshPlates();
  }
}

async function onCamerasUpdated() {
  renderAiCameraOptions();
  renderLotCameraOptions();
}

const cameraModule = createCameraModule({
  els,
  state: appState,
  api,
  notify,
  onCameraMutated,
  onCamerasUpdated
});
const logModule = createLogModule({ els, state: appState, notify });

function switchView(viewName) {
  if (!VIEW_META[viewName]) return;
  appState.currentView = viewName;

  for (const item of els.navItems) {
    item.classList.toggle('is-active', item.dataset.view === viewName);
  }
  for (const panel of els.viewPanels) {
    panel.classList.toggle('is-active', panel.dataset.viewPanel === viewName);
  }

  els.pageTitle.textContent = VIEW_META[viewName].title;
  els.pageDesc.textContent = VIEW_META[viewName].desc;

  if (viewName === 'cameras') {
    cameraModule.activateDashboardStreams();
  } else {
    cameraModule.deactivateDashboardStreams();
  }

  if (viewName === 'overview') {
    refreshDashboard().catch((err) => notify(`Overview lỗi: ${err.message}`, 'warn'));
    refreshActiveSessions().catch(console.error);
    refreshRecentPlates().catch(console.error);
    loadParkingLots().catch(console.error);
  }
  if (viewName === 'sessions') {
    refreshSessions().catch((err) => notify(`Sessions lỗi: ${err.message}`, 'warn'));
  }
  if (viewName === 'plates') {
    refreshPlates().catch((err) => notify(`Plate reads lỗi: ${err.message}`, 'warn'));
  }
  if (viewName === 'reports') {
    refreshReports().catch((err) => notify(`Reports lỗi: ${err.message}`, 'warn'));
  }
  if (viewName === 'ai') {
    refreshAiStatus().catch((err) => notify(`AI status lỗi: ${err.message}`, 'warn'));
  }
  if (viewName === 'rfid') {
    loadRfidCards().catch((err) => notify(`RFID cards lỗi: ${err.message}`, 'warn'));
    refreshRfidEventLogs().catch((err) => notify(`RFID logs lỗi: ${err.message}`, 'warn'));
  }
  if (viewName === 'parking') {
    loadParkingLots()
      .then(async () => {
        await refreshSnapshotList();
        if (lotDetailState.selectedLotId) {
          await openParkingLotDetail(lotDetailState.selectedLotId);
        }
      })
      .catch((err) => notify(`Parking lots lỗi: ${err.message}`, 'warn'));
  } else {
    closeLotDetailStreams();
  }
  if (viewName === 'system') {
    runHealthCheck(false).catch((err) => notify(`Health check lỗi: ${err.message}`, 'warn'));
  }
  logModule.onViewChange(viewName);
}

function resetPolling() {
  if (mainPoll) {
    clearInterval(mainPoll);
    mainPoll = null;
  }
  if (cameraPoll) {
    clearInterval(cameraPoll);
    cameraPoll = null;
  }

  if (!appState.settings.autoRefresh) {
    return;
  }

  const ms = Math.max(2000, appState.settings.refreshSeconds * 1000);

  // Chỉ poll dữ liệu của view đang xem để giảm tải DB (quan trọng trên NUC).
  // 'logs' tự auto-refresh trong logModule; các view tĩnh (settings/system/user) không poll.
  mainPoll = setInterval(() => {
    const view = appState.currentView;
    if (view === 'overview') {
      refreshDashboard().catch(console.error);
      refreshActiveSessions().catch(console.error);
      refreshRecentPlates().catch(console.error);
      loadParkingLots().catch(console.error);
    } else if (view === 'sessions') {
      refreshSessions().catch(console.error);
    } else if (view === 'plates') {
      refreshPlates().catch(console.error);
    } else if (view === 'ai') {
      refreshAiStatus().catch(console.error);
    } else if (view === 'rfid') {
      refreshRfidEventLogs().catch(console.error);
    } else if (view === 'parking') {
      loadParkingLots().catch(console.error);
      refreshSnapshotList().catch(console.error);
      if (lotDetailState.selectedLotId) {
        openParkingLotDetail(lotDetailState.selectedLotId).catch(console.error);
      }
    }
  }, ms);

  cameraPoll = setInterval(() => {
    cameraModule.loadCameras().catch(console.error);
  }, Math.max(5000, ms + 2000));
}

function bindEvents() {
  for (const item of els.navItems) {
    item.addEventListener('click', () => {
      switchView(item.dataset.view);
      closeSidebarMobile();
    });
  }

  els.sidebarToggleBtn.addEventListener('click', toggleSidebar);
  els.sidebarExpandBtn.addEventListener('click', () => {
    if (isMobileViewport()) {
      els.appShell.classList.add('sidebar-mobile-open');
      applySidebarUiState();
      return;
    }
    appState.settings.sidebarCollapsed = false;
    saveSettings(appState);
    applySidebarUiState();
  });
  els.sidebarOverlay.addEventListener('click', closeSidebarMobile);
  window.addEventListener('resize', applySidebarUiState);
  window.addEventListener('resize', () => {
    if (appState.currentView === 'reports' && lastStats) {
      renderReports(lastStats);
    }
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      closeSidebarMobile();
    }
  });

  els.cameraForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = els.cameraName.value.trim();
    const sourceUrl = els.cameraUrl.value.trim();
    if (!name || !sourceUrl) return;

    try {
      await api('/api/v1/cameras', {
        method: 'POST',
        body: JSON.stringify({ name, source_url: sourceUrl, enabled: true })
      });

      els.cameraForm.reset();
      await cameraModule.loadCameras();
      await onCameraMutated();
      notify('Thêm camera thành công', 'success');
    } catch (err) {
      notify(`Không thể thêm camera: ${err.message}`, 'error');
    }
  });

  els.historyRefreshBtn.addEventListener('click', () => {
    refreshSessions()
      .then(() => notify('Đã làm mới phiên xe', 'success'))
      .catch((err) => notify(`Sessions lỗi: ${err.message}`, 'error'));
  });

  els.historyActiveOnly.addEventListener('change', () => {
    refreshSessions().catch((err) => notify(`Sessions lỗi: ${err.message}`, 'error'));
  });

  els.historyLimit.addEventListener('change', () => {
    refreshSessions().catch((err) => notify(`Sessions lỗi: ${err.message}`, 'error'));
  });

  if (els.sessionsSearch) {
    els.sessionsSearch.addEventListener('input', renderSessionsTable);
  }

  if (els.platesSearch) {
    els.platesSearch.addEventListener('input', renderPlatesTable);
  }

  if (els.platesRefreshBtn) {
    els.platesRefreshBtn.addEventListener('click', () => {
      refreshPlates()
        .then(() => notify('Đã làm mới nhận diện', 'success'))
        .catch((err) => notify(`Plate reads lỗi: ${err.message}`, 'error'));
    });
  }

  if (els.reportsDays) {
    els.reportsDays.addEventListener('change', () => {
      refreshReports().catch((err) => notify(`Reports lỗi: ${err.message}`, 'error'));
    });
  }

  if (els.reportsRefreshBtn) {
    els.reportsRefreshBtn.addEventListener('click', () => {
      refreshReports()
        .then(() => notify('Đã làm mới báo cáo', 'success'))
        .catch((err) => notify(`Reports lỗi: ${err.message}`, 'error'));
    });
  }

  els.rfidForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const cardId = els.rfidCard.value.trim();
    const direction = els.rfidDirection.value;
    const lotIdRaw = els.rfidLot.value;
    const plate = els.rfidPlate.value.trim();
    const source = els.rfidSource.value.trim() || 'web-rfid-tester';

    if (!cardId) return;

    try {
      const result = await api('/api/v1/rfid-events', {
        method: 'POST',
        body: JSON.stringify({
          card_id: cardId,
          direction,
          lot_id: lotIdRaw ? Number(lotIdRaw) : null,
          plate: plate || null,
          source,
          data: { by: 'web-dashboard' }
        })
      });

      appState.rfidLogs.unshift({ ...result, at: new Date().toISOString(), card_id: cardId });
      appState.rfidLogs = appState.rfidLogs.slice(0, 30);
      renderRfidLogs();

      const feeText = (result.fee != null)
        ? ` · Phí: ${fmtMoney(result.fee, result.currency || '')}${result.duration_minutes != null ? ' (' + fmtDuration(result.duration_minutes) + ')' : ''}`
        : '';
      showScanTick(`RFID ${result.status} thành công`);
      const capText = result.snapshot_path ? ' và đã capture ảnh' : '';
      const noticeType = result.status === 'plate_mismatch' ? 'warn' : 'success';
      notify(`RFID ${result.status}${capText}${feeText}`, noticeType);

      els.rfidPlate.value = '';
      await onCameraMutated();
      await refreshRfidEventLogs();
    } catch (err) {
      notify(`RFID lỗi: ${err.message}`, 'error');
    }
  });

  els.rfidCardForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const cardId = els.rfidCardId.value.trim();
    const plate = els.rfidCardPlate.value.trim();
    const owner = els.rfidCardOwner.value.trim();

    if (!cardId || !plate) return;

    try {
      await api('/api/v1/rfid/cards', {
        method: 'POST',
        body: JSON.stringify({ card_id: cardId, plate, owner_name: owner || null })
      });
      notify('Thêm thẻ RFID thành công', 'success');
      els.rfidCardForm.reset();
      await loadRfidCards();
    } catch (err) {
      notify(`Thêm thẻ lỗi: ${err.message}`, 'error');
    }
  });

  els.lotForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = els.lotName.value.trim();
    if (!name) return;
    const editId = els.lotEditId.value ? Number(els.lotEditId.value) : null;
    const method = editId ? 'PUT' : 'POST';
    const path = editId ? `/api/v1/parking-lots/${editId}` : '/api/v1/parking-lots';

    try {
      await api(path, {
        method,
        body: JSON.stringify({
          name,
          capacity: els.lotCapacity && els.lotCapacity.value !== '' ? Number(els.lotCapacity.value) : 50,
          entry_camera_id: els.lotEntryCamera.value ? Number(els.lotEntryCamera.value) : null,
          exit_camera_id: els.lotExitCamera.value ? Number(els.lotExitCamera.value) : null,
          is_active: Boolean(els.lotIsActive.checked),
        }),
      });
      notify(editId ? 'Cập nhật bãi xe thành công' : 'Tạo bãi xe thành công', 'success');
      resetLotForm();
      await loadParkingLots();
      await refreshSnapshotList();
      if (editId) {
        await openParkingLotDetail(editId);
      }
    } catch (err) {
      notify(`Lưu bãi xe lỗi: ${err.message}`, 'error');
    }
  });

  els.lotCancelEditBtn.addEventListener('click', () => {
    resetLotForm();
  });

  els.lotDetailCloseBtn.addEventListener('click', () => {
    lotDetailState.selectedLotId = null;
    closeLotDetailStreams();
    els.lotDetailTitle.textContent = 'Chi tiết bãi xe';
    els.lotDetailMeta.textContent = 'Chọn bãi xe từ danh sách để xem dữ liệu riêng.';
    els.lotDetailLogBody.innerHTML = '<tr><td colspan="5" class="empty">Chưa có dữ liệu</td></tr>';
    els.lotEntryCaptureImg.src = '';
    els.lotExitCaptureImg.src = '';
    setCaptureStatusIdle();
    setLotPlaceholder('entry', 'Chưa có camera vào');
    setLotPlaceholder('exit', 'Chưa có camera ra');
  });

  els.snapshotLotFilter.addEventListener('change', () => {
    refreshSnapshotList().catch((err) => notify(`Snapshot lỗi: ${err.message}`, 'error'));
  });

  els.snapshotRefreshBtn.addEventListener('click', () => {
    refreshSnapshotList()
      .then(() => notify('Đã làm mới snapshot', 'success'))
      .catch((err) => notify(`Snapshot lỗi: ${err.message}`, 'error'));
  });

  els.aiUploadForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const file = els.aiModelFile.files?.[0];
    if (!file) return;

    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api('/api/v1/ai/models', {
        method: 'POST',
        body: form
      });

      notify(`Upload model thành công: ${result.filename}`, 'success');
      els.aiUploadForm.reset();
      await refreshAiStatus();
    } catch (err) {
      notify(`Upload model lỗi: ${err.message}`, 'error');
    }
  });

  els.aiTestForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const cameraId = Number(els.aiCameraSelect.value || 0);
    if (!cameraId) {
      notify('Chọn camera trước khi test AI', 'warn');
      return;
    }

    try {
      const result = await api('/api/v1/ai/test-camera', {
        method: 'POST',
        body: JSON.stringify({ camera_id: cameraId })
      });

      els.aiTestResult.textContent = JSON.stringify(result, null, 2);
      if (!result.frame_available) {
        notify('Camera chưa có frame để test', 'warn');
      } else {
        notify(`AI test xong. Số detection: ${result.detections.length}`, 'success');
      }
    } catch (err) {
      notify(`AI test lỗi: ${err.message}`, 'error');
      els.aiTestResult.textContent = `Lỗi: ${err.message}`;
    }
  });

  // ---- Đổi mật khẩu (cần mật khẩu hiện tại) ----
  els.changePwForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    els.cpError.textContent = '';
    const oldPw = els.cpOld.value;
    const newPw = els.cpNew.value;
    const confirmPw = els.cpConfirm.value;
    if (!oldPw || !newPw) {
      els.cpError.textContent = 'Nhập đầy đủ mật khẩu.';
      return;
    }
    if (newPw !== confirmPw) {
      els.cpError.textContent = 'Mật khẩu mới không khớp.';
      return;
    }
    try {
      await api('/api/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ old_password: oldPw, new_password: newPw })
      });
      els.changePwForm.reset();
      notify('Đổi mật khẩu thành công', 'success');
    } catch (err) {
      els.cpError.textContent = err.message;
      notify(`Đổi mật khẩu lỗi: ${err.message}`, 'error');
    }
  });

  // ---- Đặt lại mật khẩu (quản trị, không điều kiện) ----
  els.resetPwForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    els.resetError.textContent = '';
    const username = els.resetUser.value.trim();
    const newPw = els.resetNew.value;
    if (!username || !newPw) {
      els.resetError.textContent = 'Nhập đầy đủ tên đăng nhập và mật khẩu mới.';
      return;
    }
    try {
      await api('/api/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ username, new_password: newPw })
      });
      els.resetPwForm.reset();
      notify(`Đã đặt lại mật khẩu cho ${username}`, 'success');
    } catch (err) {
      els.resetError.textContent = err.message;
      notify(`Đặt lại mật khẩu lỗi: ${err.message}`, 'error');
    }
  });

  els.logoutBtn.addEventListener('click', () => {
    stopApp();
    appState.user.username = '';
    clearToken();
    notify('Đã đăng xuất', 'success');
    goToLogin();
  });

  els.settingsForm.addEventListener('submit', (ev) => {
    ev.preventDefault();

    const refreshSeconds = Number(els.refreshSeconds.value || 3);
    appState.settings.refreshSeconds = Math.min(60, Math.max(2, refreshSeconds));
    appState.settings.autoRefresh = Boolean(els.autoRefresh.checked);

    applySettingsToForm();
    saveSettings(appState);
    applySidebarUiState();
    resetPolling();
    notify('Đã lưu cài đặt', 'success');
  });

  els.healthCheckBtn.addEventListener('click', () => {
    runHealthCheck(true).catch((err) => notify(`Health check lỗi: ${err.message}`, 'error'));
  });
}

let appStarted = false;

// Tải dữ liệu + bật polling/stream. Chỉ chạy SAU khi đã đăng nhập.
async function startApp() {
  if (appStarted) return;
  appStarted = true;

  try {
    await Promise.all([
      cameraModule.loadCameras(),
      refreshDashboard(),
      refreshActiveSessions(),
      refreshRecentPlates(),
      refreshAiStatus(),
      refreshRfidEventLogs(),
      loadParkingLots().then(() => refreshSnapshotList())
    ]);
    await runHealthCheck(false);
    notify('Kết nối backend thành công', 'success');
  } catch (err) {
    notify(`Không thể kết nối backend (${API_BASE}): ${err.message}`, 'error');
  }

  switchView('overview');
  resetPolling();
}

// Dừng polling + đóng stream khi đăng xuất.
function stopApp() {
  appStarted = false;
  if (mainPoll) { clearInterval(mainPoll); mainPoll = null; }
  if (cameraPoll) { clearInterval(cameraPoll); cameraPoll = null; }
  cameraModule.deactivateDashboardStreams();
}

async function bootstrap() {
  // Token-gate: chưa đăng nhập → chuyển sang trang login riêng.
  if (!isAuthenticated()) {
    goToLogin();
    return;
  }

  loadStorage(appState);
  appState.user.username = getStoredUser();
  applySettingsToForm();
  applySidebarUiState();
  renderUserState();
  bindEvents();
  cameraModule.init();
  logModule.init();
  resetLotForm();
  renderRfidLogs();

  // Xác thực token + lấy username hiện tại; token hỏng → api() tự redirect /login.
  try {
    const me = await api('/api/v1/auth/me');
    appState.user.username = me.username;
    renderUserState();
  } catch {
    return; // 401 đã được api() xử lý (redirect)
  }

  await startApp();
}

bootstrap();
