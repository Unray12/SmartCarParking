// Sidebar (drawer/collapse) + form cài đặt hiển thị.
import { API_BASE } from './api.js';
import { appState, saveSettings } from './state.js';
import { els } from './dom.js';

export function isMobileViewport() {
  return window.matchMedia('(max-width: 1180px)').matches;
}

export function applySettingsToForm() {
  els.refreshSeconds.value = String(appState.settings.refreshSeconds);
  els.autoRefresh.checked = appState.settings.autoRefresh;
  els.apiBaseReadonly.value = API_BASE;
}

export function applySidebarUiState() {
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

export function toggleSidebar() {
  if (isMobileViewport()) {
    els.appShell.classList.toggle('sidebar-mobile-open');
    applySidebarUiState();
    return;
  }
  appState.settings.sidebarCollapsed = !appState.settings.sidebarCollapsed;
  saveSettings(appState);
  applySidebarUiState();
}

export function closeSidebarMobile() {
  if (!isMobileViewport()) return;
  els.appShell.classList.remove('sidebar-mobile-open');
  applySidebarUiState();
}

// Gắn sự kiện cho sidebar. onEscape gọi khi nhấn Esc (đóng drawer).
export function initLayout() {
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
    if (ev.key === 'Escape') closeSidebarMobile();
  });
}
