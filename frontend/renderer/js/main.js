import { api, API_BASE } from './api.js';
import { appState, VIEW_META, loadStorage, saveSettings } from './state.js';
import { createCameraModule } from './camera.js';

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

  rfidForm: document.getElementById('rfidForm'),
  rfidCard: document.getElementById('rfidCard'),
  rfidDirection: document.getElementById('rfidDirection'),
  rfidPlate: document.getElementById('rfidPlate'),
  rfidSource: document.getElementById('rfidSource'),
  rfidLogBody: document.getElementById('rfidLogBody'),

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

function isMobileViewport() {
  return window.matchMedia('(max-width: 1180px)').matches;
}

function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('vi-VN', { hour12: false });
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
}

const cameraModule = createCameraModule({
  els,
  state: appState,
  api,
  notify,
  onCameraMutated,
  onCamerasUpdated
});

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
  if (viewName === 'system') {
    runHealthCheck(false).catch((err) => notify(`Health check lỗi: ${err.message}`, 'warn'));
  }
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
    const plate = els.rfidPlate.value.trim();
    const source = els.rfidSource.value.trim() || 'web-rfid-tester';

    if (!cardId) return;

    try {
      const result = await api('/api/rfid/events', {
        method: 'POST',
        body: JSON.stringify({
          card_id: cardId,
          direction,
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
    } catch (err) {
      notify(`RFID lỗi: ${err.message}`, 'error');
    }
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
  if (isAuthenticated()) {
    appState.user.username = sessionStorage.getItem(AUTH_USER_KEY) || '';
    if (!appState.user.username) {
      setAuthSession('');
      showLoginGate();
    }
  } else {
    appState.user.username = '';
    showLoginGate();
  }
  applySettingsToForm();
  applySidebarUiState();
  renderUserState();
  bindEvents();
  cameraModule.init();
  renderRfidLogs();

  try {
    await Promise.all([
      cameraModule.loadCameras(),
      refreshDashboard(),
      refreshActiveSessions(),
      refreshRecentPlates(),
      refreshHistory(),
      refreshAiStatus()
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
