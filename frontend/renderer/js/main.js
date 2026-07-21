// Orchestrator: ghép các module/trang, điều phối chuyển tab, polling, vòng đời app.
import { api, API_BASE, getStoredUser } from './api.js';
import { appState, VIEW_META, loadStorage, saveSettings, loadNav, saveNav } from './state.js';
import { els } from './dom.js';
import { notify, withButtonBusy } from './ui.js';
import { initLayout, applySettingsToForm, applySidebarUiState, closeSidebarMobile } from './layout.js';
import { initAccount, renderUserState, isAuthenticated, goToLogin } from './account.js';
import { initConfirmDialog } from './confirm-dialog.js';
import { createCameraModule } from './camera.js';
import { createLogModule } from './logs.js';

import * as overview from './views/overview.js';
import * as history from './views/history.js';
import * as reports from './views/reports.js';
import * as parking from './views/parking.js';
import * as rfid from './views/rfid.js';
import * as ai from './views/ai.js';
import * as system from './views/system.js';

let mainPoll = null;
let cameraPoll = null;
let appStarted = false;

// ---- Cross-view orchestration ----
async function onCameraMutated() {
  await overview.refreshOverviewMetrics();
  if (appState.currentView === 'sessions') await history.refreshSessions();
  if (appState.currentView === 'plates') await history.refreshPlates();
}

function onCamerasUpdated() {
  ai.renderAiCameraOptions();
  parking.renderLotCameraOptions();
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

// ---- Điều hướng tab ----
// updateHash=false khi chính hashchange (back/forward) gọi vào -> tránh set lại hash gây lặp.
function switchView(viewName, { updateHash = true } = {}) {
  if (!VIEW_META[viewName]) return;
  appState.currentView = viewName;

  // Giữ phiên: nhớ trang đang xem + phản ánh lên URL (refresh/bookmark/back-forward đều đúng).
  saveNav({ view: viewName });
  if (updateHash && location.hash.replace(/^#/, '') !== viewName) {
    location.hash = viewName;
  }

  for (const item of els.navItems) {
    item.classList.toggle('is-active', item.dataset.view === viewName);
  }
  for (const panel of els.viewPanels) {
    panel.classList.toggle('is-active', panel.dataset.viewPanel === viewName);
  }

  els.pageTitle.textContent = VIEW_META[viewName].title;
  els.pageDesc.textContent = VIEW_META[viewName].desc;

  if (viewName === 'cameras') cameraModule.activateDashboardStreams();
  else cameraModule.deactivateDashboardStreams();

  if (viewName === 'overview') {
    overview.refreshDashboard().catch((err) => notify(`Overview lỗi: ${err.message}`, 'warn'));
    overview.refreshActiveSessions().catch(console.error);
    overview.refreshRecentPlates().catch(console.error);
    parking.loadParkingLots().catch(console.error);
  }
  if (viewName === 'sessions') {
    history.refreshSessions().catch((err) => notify(`Sessions lỗi: ${err.message}`, 'warn'));
  }
  if (viewName === 'plates') {
    history.refreshPlates().catch((err) => notify(`Plate reads lỗi: ${err.message}`, 'warn'));
  }
  if (viewName === 'reports') {
    reports.refreshReports().catch((err) => notify(`Reports lỗi: ${err.message}`, 'warn'));
  }
  if (viewName === 'ai') {
    ai.refreshAiStatus().catch((err) => notify(`AI status lỗi: ${err.message}`, 'warn'));
  } else {
    ai.stopAiLiveTest();
  }
  if (viewName === 'rfid') {
    rfid.loadRfidCards().catch((err) => notify(`RFID cards lỗi: ${err.message}`, 'warn'));
    rfid.refreshRfidEventLogs().catch((err) => notify(`RFID logs lỗi: ${err.message}`, 'warn'));
  }
  if (viewName === 'parking') {
    parking.loadParkingLots()
      .then(async () => {
        await parking.refreshSnapshotList();
        if (parking.getSelectedLotId()) await parking.openParkingLotDetail(parking.getSelectedLotId());
      })
      .catch((err) => notify(`Parking lots lỗi: ${err.message}`, 'warn'));
  } else {
    parking.closeLotDetailStreams();
    parking.stopCaptureStatusPolling();
  }
  if (viewName === 'system') {
    system.runHealthCheck(false).catch((err) => notify(`Health check lỗi: ${err.message}`, 'warn'));
  }
  logModule.onViewChange(viewName);
}

// Trang khởi động: ưu tiên URL hash (bookmark/refresh/chia sẻ link), rồi tới trang đã lưu
// phiên trước, cuối cùng mặc định overview. Bỏ hash không hợp lệ.
function getInitialView() {
  const fromHash = location.hash.replace(/^#/, '');
  if (VIEW_META[fromHash]) return fromHash;
  const saved = loadNav().view;
  if (VIEW_META[saved]) return saved;
  return 'overview';
}

// ---- Polling: chỉ làm mới dữ liệu của tab đang xem (giảm tải, hợp với NUC) ----
function resetPolling() {
  if (mainPoll) { clearInterval(mainPoll); mainPoll = null; }
  if (cameraPoll) { clearInterval(cameraPoll); cameraPoll = null; }
  if (!appState.settings.autoRefresh) return;

  const ms = Math.max(2000, appState.settings.refreshSeconds * 1000);

  mainPoll = setInterval(() => {
    const view = appState.currentView;
    if (view === 'overview') {
      overview.refreshDashboard().catch(console.error);
      overview.refreshActiveSessions().catch(console.error);
      overview.refreshRecentPlates().catch(console.error);
      parking.loadParkingLots().catch(console.error);
    } else if (view === 'sessions') {
      history.refreshSessions().catch(console.error);
    } else if (view === 'plates') {
      history.refreshPlates().catch(console.error);
    } else if (view === 'ai') {
      ai.refreshAiStatus().catch(console.error);
    } else if (view === 'rfid') {
      rfid.refreshRfidEventLogs().catch(console.error);
    } else if (view === 'parking') {
      parking.loadParkingLots().catch(console.error);
      parking.refreshSnapshotList().catch(console.error);
      if (parking.getSelectedLotId()) parking.openParkingLotDetail(parking.getSelectedLotId()).catch(console.error);
    }
  }, ms);

  cameraPoll = setInterval(() => {
    cameraModule.loadCameras().catch(console.error);
  }, Math.max(5000, ms + 2000));
}

// ---- Sự kiện toàn cục (nav, form thêm camera, form cài đặt) ----
function bindGlobalEvents() {
  for (const item of els.navItems) {
    item.addEventListener('click', () => {
      switchView(item.dataset.view);
      closeSidebarMobile();
    });
  }

  // Nút back/forward của trình duyệt đổi hash -> đồng bộ view (không set lại hash để khỏi lặp).
  window.addEventListener('hashchange', () => {
    const view = location.hash.replace(/^#/, '');
    if (VIEW_META[view] && view !== appState.currentView) {
      switchView(view, { updateHash: false });
    }
  });

  els.cameraForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = els.cameraName.value.trim();
    const sourceUrl = els.cameraUrl.value.trim();
    if (!name || !sourceUrl) return;
    const submitBtn = ev.submitter || els.cameraForm.querySelector('[type="submit"]');
    try {
      await withButtonBusy(submitBtn, 'Đang thêm…', () => api('/api/v1/cameras', {
        method: 'POST',
        body: JSON.stringify({ name, source_url: sourceUrl, enabled: true })
      }));
      els.cameraForm.reset();
      await cameraModule.loadCameras();
      await onCameraMutated();
      notify('Thêm camera thành công', 'success');
    } catch (err) {
      notify(`Không thể thêm camera: ${err.message}`, 'error');
    }
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
}

// ---- Vòng đời app ----
async function startApp() {
  if (appStarted) return;
  appStarted = true;
  try {
    await Promise.all([
      cameraModule.loadCameras(),
      overview.refreshDashboard(),
      overview.refreshActiveSessions(),
      overview.refreshRecentPlates(),
      ai.refreshAiStatus(),
      rfid.refreshRfidEventLogs(),
      parking.loadParkingLots().then(() => parking.refreshSnapshotList())
    ]);
    await system.runHealthCheck(false);
    notify('Kết nối backend thành công', 'success');
  } catch (err) {
    notify(`Không thể kết nối backend (${API_BASE}): ${err.message}`, 'error');
  }
  switchView(getInitialView());
  resetPolling();
}

function stopApp() {
  appStarted = false;
  if (mainPoll) { clearInterval(mainPoll); mainPoll = null; }
  if (cameraPoll) { clearInterval(cameraPoll); cameraPoll = null; }
  // Đóng TOÀN BỘ resource stream/AI của mọi trang, không chỉ trang đang xem lúc logout -
  // nếu không, WS chi tiết bãi xe (parking) hoặc AI live test vẫn chạy ngầm sau khi
  // đăng xuất (chỉ dừng lại khi tự tắt trình duyệt/tab, không phải ngay khi logout).
  cameraModule.deactivateDashboardStreams();
  parking.closeLotDetailStreams();
  parking.stopCaptureStatusPolling();
  ai.stopAiLiveTest();
}

async function bootstrap() {
  // Token-gate: chưa đăng nhập → sang trang login riêng.
  if (!isAuthenticated()) {
    goToLogin();
    return;
  }

  loadStorage(appState);
  appState.user.username = getStoredUser();
  applySettingsToForm();
  applySidebarUiState();
  renderUserState();

  // Gắn sự kiện cho từng module/trang.
  bindGlobalEvents();
  initLayout();
  initConfirmDialog();
  initAccount({ onLogout: stopApp });
  history.initHistory();
  reports.initReports();
  parking.initParking({ onLotsLoaded: overview.renderOverviewLots });
  rfid.initRfid({ onEvent: onCameraMutated });
  ai.initAi();
  system.initSystem();
  cameraModule.init();
  logModule.init();
  parking.resetLotForm();
  rfid.renderRfidLogs();

  // Xác thực token + lấy username; token hỏng → api() tự redirect /login.
  try {
    const me = await api('/api/v1/auth/me');
    appState.user.username = me.username;
    renderUserState();
  } catch {
    return;
  }

  await startApp();
}

bootstrap();
