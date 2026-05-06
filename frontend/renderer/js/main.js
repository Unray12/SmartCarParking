import { api, API_BASE } from './api.js';
import { appState, VIEW_META, loadStorage, saveSettings } from './state.js';
import { createCameraModule } from './camera.js';
import { createLogModule } from './logs.js';
import { WS_BASE } from './api.js';

const els = {
  appShell: document.getElementById('appShell'),
  sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
  sidebarExpandBtn: document.getElementById('sidebarExpandBtn'),
  sidebarOverlay: document.getElementById('sidebarOverlay'),
  loginGate: document.getElementById('loginGate'),
  loginGateForm: document.getElementById('loginGateForm'),
  loginGateUsername: document.getElementById('loginGateUsername'),
  loginGatePassword: document.getElementById('loginGatePassword'),
  loginGateError: document.getElementById('loginGateError'),
  pageTitle: document.getElementById('pageTitle'),
  pageDesc: document.getElementById('pageDesc'),
  globalNotice: document.getElementById('globalNotice'),
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

  historyActiveOnly: document.getElementById('historyActiveOnly'),
  historyLimit: document.getElementById('historyLimit'),
  historyRefreshBtn: document.getElementById('historyRefreshBtn'),
  historySessionBody: document.getElementById('historySessionBody'),
  historyPlateBody: document.getElementById('historyPlateBody'),
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
  lotDetailLogBody: document.getElementById('lotDetailLogBody'),

  aiUploadForm: document.getElementById('aiUploadForm'),
  aiModelFile: document.getElementById('aiModelFile'),
  aiStatusText: document.getElementById('aiStatusText'),
  aiModelsList: document.getElementById('aiModelsList'),
  aiTestForm: document.getElementById('aiTestForm'),
  aiCameraSelect: document.getElementById('aiCameraSelect'),
  aiTestResult: document.getElementById('aiTestResult'),

  userLoginForm: document.getElementById('userLoginForm'),
  userName: document.getElementById('userName'),
  userPassword: document.getElementById('userPassword'),
  userLoginError: document.getElementById('userLoginError'),
  userStateText: document.getElementById('userStateText'),
  logoutBtn: document.getElementById('logoutBtn'),

  settingsForm: document.getElementById('settingsForm'),
  refreshSeconds: document.getElementById('refreshSeconds'),
  autoRefresh: document.getElementById('autoRefresh'),
  apiBaseReadonly: document.getElementById('apiBaseReadonly'),

  healthCheckBtn: document.getElementById('healthCheckBtn'),
  healthResult: document.getElementById('healthResult')
};

let noticeTimeout = null;
let mainPoll = null;
let cameraPoll = null;
const AUTH_FLAG_KEY = 'scp_auth_ok';
const AUTH_USER_KEY = 'scp_auth_user';
const lotDetailState = {
  selectedLotId: null,
  entryWs: null,
  exitWs: null
};

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

function setAuthSession(username) {
  if (username) {
    sessionStorage.setItem(AUTH_FLAG_KEY, '1');
    sessionStorage.setItem(AUTH_USER_KEY, username);
    return;
  }
  sessionStorage.removeItem(AUTH_FLAG_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
}

function isAuthenticated() {
  return sessionStorage.getItem(AUTH_FLAG_KEY) === '1';
}

function showLoginGate() {
  els.loginGate.classList.remove('is-hidden');
  els.loginGateError.textContent = '';
  els.loginGateUsername.focus();
}

function hideLoginGate() {
  els.loginGate.classList.add('is-hidden');
  els.loginGateError.textContent = '';
  if (els.userLoginError) {
    els.userLoginError.textContent = '';
  }
  els.loginGateForm.reset();
}

function normalizeLoginError(message) {
  const msg = String(message || '').trim();
  if (!msg) return 'Đăng nhập thất bại.';
  if (msg.includes('Failed to fetch')) {
    return `Không kết nối được backend (${API_BASE}).`;
  }
  if (msg.includes('Request timeout')) {
    return 'Kết nối backend quá chậm (timeout), vui lòng thử lại.';
  }
  if (msg.includes('HTTP 404')) {
    return 'Backend chưa có API đăng nhập. Hãy restart backend phiên bản mới.';
  }
  return msg;
}

function setFormSubmitState(form, submitting, idleText) {
  if (!form) return;
  const submitBtn = form.querySelector('button[type="submit"]');
  if (!submitBtn) return;
  if (!submitBtn.dataset.idleText) {
    submitBtn.dataset.idleText = idleText || submitBtn.textContent || 'Submit';
  }
  submitBtn.disabled = submitting;
  submitBtn.textContent = submitting ? 'Đang đăng nhập...' : submitBtn.dataset.idleText;
}

async function performLogin(username, password, errorTarget) {
  if (errorTarget) {
    errorTarget.textContent = '';
  }

  try {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    appState.user.username = res.username || username;
    setAuthSession(appState.user.username);
    renderUserState();
    hideLoginGate();
    notify('Đăng nhập thành công', 'success');
    return true;
  } catch (err) {
    const message = normalizeLoginError(err?.message);
    if (errorTarget) {
      errorTarget.textContent = message;
    }
    notify(message, 'error');
    return false;
  }
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
  const summary = await api('/api/dashboard/summary');
  els.mCamerasTotal.textContent = summary.cameras_total;
  els.mCamerasOn.textContent = summary.cameras_enabled;
  els.mActive.textContent = summary.active_sessions;
  els.mCheckin.textContent = summary.today_checkins;
  els.mCheckout.textContent = summary.today_checkouts;
}

async function refreshActiveSessions() {
  const sessions = await api('/api/sessions?active_only=true&limit=20');
  els.sessionBody.innerHTML = '';

  if (!sessions.length) {
    els.sessionBody.innerHTML = '<tr><td colspan="4" class="empty">Chưa có xe đang gửi</td></tr>';
    return;
  }

  for (const row of sessions) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.id}</td>
      <td>${row.plate}</td>
      <td>${row.rfid_card}</td>
      <td>${fmtDate(row.entry_time)}</td>
    `;
    els.sessionBody.appendChild(tr);
  }
}

async function refreshRecentPlates() {
  const plates = await api('/api/plates/recent?limit=25');
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

async function refreshHistory() {
  const limit = Number(els.historyLimit.value || 50);
  const activeOnly = els.historyActiveOnly.checked;

  const [sessions, plates] = await Promise.all([
    api(`/api/sessions?active_only=${activeOnly}&limit=${limit}`),
    api(`/api/plates/recent?limit=${limit}`)
  ]);

  els.historySessionBody.innerHTML = '';
  if (!sessions.length) {
    els.historySessionBody.innerHTML = '<tr><td colspan="6" class="empty">Không có dữ liệu phiên xe</td></tr>';
  } else {
    for (const row of sessions) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.id}</td>
        <td>${row.plate}</td>
        <td>${row.rfid_card}</td>
        <td>${fmtDate(row.entry_time)}</td>
        <td>${fmtDate(row.exit_time)}</td>
        <td>${row.status}</td>
      `;
      els.historySessionBody.appendChild(tr);
    }
  }

  els.historyPlateBody.innerHTML = '';
  if (!plates.length) {
    els.historyPlateBody.innerHTML = '<tr><td colspan="5" class="empty">Không có dữ liệu nhận diện</td></tr>';
  } else {
    for (const row of plates) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmtDate(row.seen_at)}</td>
        <td>${row.camera_name}</td>
        <td>${row.plate}</td>
        <td>${row.confidence == null ? '-' : row.confidence.toFixed(3)}</td>
        <td>${row.linked ? 'Yes' : 'No'}</td>
      `;
      els.historyPlateBody.appendChild(tr);
    }
  }
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
}

function fillLotFormForEdit(lot) {
  els.lotEditId.value = String(lot.id);
  els.lotFormTitle.textContent = `Sửa bãi xe #${lot.id}`;
  els.lotSubmitBtn.textContent = 'Cập nhật bãi xe';
  els.lotName.value = lot.name;
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

function renderParkingLots(lots) {
  els.lotBody.innerHTML = '';
  if (!lots.length) {
    els.lotBody.innerHTML = '<tr><td colspan="8" class="empty">Chưa có bãi xe</td></tr>';
    return;
  }

  for (const lot of lots) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${lot.id}</td>
      <td>${lot.name}</td>
      <td>${cameraNameById(lot.entry_camera_id)}</td>
      <td>${cameraNameById(lot.exit_camera_id)}</td>
      <td>${lot.is_active ? 'Active' : 'Inactive'}</td>
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
        await api(`/api/parking-lots/${lotId}`, { method: 'DELETE' });
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
  const lots = await api('/api/parking-lots');
  appState.parkingLots = lots;
  renderParkingLots(lots);
  renderLotFilterOptions(lots);
}

function closeLotWs(ws) {
  if (!ws) return null;
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
  lotDetailState.entryWs = closeLotWs(lotDetailState.entryWs);
  lotDetailState.exitWs = closeLotWs(lotDetailState.exitWs);
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

  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(row.at)}</td>
      <td>${row.direction}</td>
      <td>${row.plate}</td>
      <td>${row.card}</td>
      <td>${row.status}</td>
    `;
    els.lotDetailLogBody.appendChild(tr);
  }
}

function renderLotLatestCaptures(snapshots) {
  const latestIn = snapshots.find((x) => x.direction === 'in');
  const latestOut = snapshots.find((x) => x.direction === 'out');
  els.lotEntryCaptureImg.src = latestIn ? absoluteApiUrlNoCache(latestIn.image_url) : '';
  els.lotExitCaptureImg.src = latestOut ? absoluteApiUrlNoCache(latestOut.image_url) : '';
}

async function openParkingLotDetail(lotId) {
  const data = await api(`/api/parking-lots/${lotId}/overview?limit=100`);
  lotDetailState.selectedLotId = lotId;
  els.lotDetailTitle.textContent = `Chi tiết bãi xe: ${data.lot.name} (#${data.lot.id})`;
  els.lotDetailMeta.textContent = `Cam vào: ${cameraNameById(data.lot.entry_camera_id)} | Cam ra: ${cameraNameById(data.lot.exit_camera_id)}`;
  renderLotDetailLogs(data.sessions || []);
  renderLotLatestCaptures(data.snapshots || []);

  closeLotDetailStreams();
  openLotStream('entry', data.lot.entry_camera_id);
  openLotStream('exit', data.lot.exit_camera_id);
}

async function refreshSnapshotList() {
  const lotId = els.snapshotLotFilter.value;
  const query = lotId ? `?lot_id=${lotId}&limit=100` : '?limit=100';
  const rows = await api(`/api/snapshots${query}`);

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
    const logs = await api('/api/logs?hours=24&limit=50');
    const mapped = [];

    for (const row of logs) {
      if (row.type !== 'rfid_in' && row.type !== 'rfid_out' && row.type !== 'session_in' && row.type !== 'session_out') {
        continue;
      }

      mapped.push({
        at: row.timestamp,
        card_id: row.details?.card_id || row.details?.rfid_card || '-',
        status: row.type,
        plate: row.details?.plate || '-',
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
    const cards = await api('/api/rfid/cards');
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
        await api(`/api/rfid/cards/${cardId}`, { method: 'DELETE' });
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
    const data = await api('/api/ai/status');
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
  if (appState.currentView === 'history') {
    await refreshHistory();
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

  if (viewName === 'dashboard') {
    cameraModule.activateDashboardStreams();
  } else {
    cameraModule.deactivateDashboardStreams();
  }

  if (viewName === 'history') {
    refreshHistory().catch((err) => notify(`History lỗi: ${err.message}`, 'warn'));
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

  mainPoll = setInterval(() => {
    refreshDashboard().catch(console.error);
    refreshActiveSessions().catch(console.error);
    refreshRecentPlates().catch(console.error);

    if (appState.currentView === 'history') {
      refreshHistory().catch(console.error);
    }
    if (appState.currentView === 'ai') {
      refreshAiStatus().catch(console.error);
    }
    if (appState.currentView === 'rfid') {
      refreshRfidEventLogs().catch(console.error);
    }
    if (appState.currentView === 'parking') {
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
      await api('/api/cameras', {
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
    refreshHistory()
      .then(() => notify('Đã làm mới history', 'success'))
      .catch((err) => notify(`History lỗi: ${err.message}`, 'error'));
  });

  els.historyActiveOnly.addEventListener('change', () => {
    refreshHistory().catch((err) => notify(`History lỗi: ${err.message}`, 'error'));
  });

  els.historyLimit.addEventListener('change', () => {
    refreshHistory().catch((err) => notify(`History lỗi: ${err.message}`, 'error'));
  });

  els.rfidForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const cardId = els.rfidCard.value.trim();
    const direction = els.rfidDirection.value;
    const lotIdRaw = els.rfidLot.value;
    const plate = els.rfidPlate.value.trim();
    const source = els.rfidSource.value.trim() || 'web-rfid-tester';

    if (!cardId) return;

    try {
      const result = await api('/api/rfid/events', {
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
      notify(`RFID ${result.status}`, 'success');

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
      await api('/api/rfid/cards', {
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
    const path = editId ? `/api/parking-lots/${editId}` : '/api/parking-lots';

    try {
      await api(path, {
        method,
        body: JSON.stringify({
          name,
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
      const result = await api('/api/ai/upload-model', {
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
      const result = await api('/api/ai/test-camera', {
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

  els.userLoginForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (els.userLoginError) {
      els.userLoginError.textContent = '';
    }
    const username = els.userName.value.trim();
    const password = els.userPassword.value.trim();

    if (!username || !password) {
      if (els.userLoginError) {
        els.userLoginError.textContent = 'Nhập đầy đủ username và password.';
      }
      notify('Nhập đầy đủ username và password', 'warn');
      return;
    }

    setFormSubmitState(els.userLoginForm, true, 'Login');
    const ok = await performLogin(username, password, els.userLoginError);
    setFormSubmitState(els.userLoginForm, false, 'Login');
    if (ok) {
      els.userLoginForm.reset();
    }
  });

  els.logoutBtn.addEventListener('click', () => {
    appState.user.username = '';
    setAuthSession('');
    renderUserState();
    showLoginGate();
    closeSidebarMobile();
    notify('Đã logout', 'success');
  });

  els.loginGateForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    els.loginGateError.textContent = '';
    const username = els.loginGateUsername.value.trim();
    const password = els.loginGatePassword.value.trim();
    if (!username || !password) {
      els.loginGateError.textContent = 'Nhập đầy đủ username và password.';
      return;
    }
    setFormSubmitState(els.loginGateForm, true, 'Đăng nhập');
    await performLogin(username, password, els.loginGateError);
    setFormSubmitState(els.loginGateForm, false, 'Đăng nhập');
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

async function bootstrap() {
  loadStorage(appState);
  // TEMP: deactive login - skip auth check
  appState.user.username = 'guest';
  setAuthSession('guest');
  hideLoginGate();
  // END TEMP
  applySettingsToForm();
  applySidebarUiState();
  renderUserState();
  bindEvents();
  cameraModule.init();
  logModule.init();
  resetLotForm();
  renderRfidLogs();

  try {
    await Promise.all([
      cameraModule.loadCameras(),
      refreshDashboard(),
      refreshActiveSessions(),
      refreshRecentPlates(),
      refreshHistory(),
      refreshAiStatus(),
      refreshRfidEventLogs(),
      loadParkingLots().then(() => refreshSnapshotList())
    ]);
    await runHealthCheck(false);
    notify('Kết nối backend thành công', 'success');
  } catch (err) {
    notify(`Không thể kết nối backend (${API_BASE}): ${err.message}`, 'error');
  }

  switchView('dashboard');
  resetPolling();
}

bootstrap();
