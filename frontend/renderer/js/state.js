export const VIEW_META = {
  dashboard: {
    title: 'Dashboard',
    desc: 'Giám sát camera realtime, quản lý phiên xe và biển số.'
  },
  history: {
    title: 'History',
    desc: 'Tra cứu lịch sử vào/ra và dữ liệu nhận diện biển số.'
  },
  rfid: {
    title: 'RFID Gate',
    desc: 'Mô phỏng hoặc gửi sự kiện RFID qua HTTP để test luồng vào/ra.'
  },
  ai: {
    title: 'AI Center',
    desc: 'Upload model và test nhận diện trên camera đang chạy.'
  },
  user: {
    title: 'User',
    desc: 'Quản lý phiên đăng nhập dashboard qua backend.'
  },
  settings: {
    title: 'Settings',
    desc: 'Cấu hình chu kỳ làm mới và thông tin endpoint.'
  },
  system: {
    title: 'System',
    desc: 'Kiểm tra trạng thái backend và thông tin vận hành.'
  }
};

const STORAGE_KEYS = {
  settings: 'scp_settings_v1'
};

export const appState = {
  currentView: 'dashboard',
  cameras: [],
  focusedCameraId: null,
  rfidLogs: [],
  user: {
    username: ''
  },
  settings: {
    refreshSeconds: 3,
    autoRefresh: true,
    sidebarCollapsed: false
  }
};

export function loadStorage(state) {
  try {
    const rawSettings = localStorage.getItem(STORAGE_KEYS.settings);
    if (rawSettings) {
      const parsed = JSON.parse(rawSettings);
      if (typeof parsed.refreshSeconds === 'number') {
        state.settings.refreshSeconds = Math.min(60, Math.max(2, parsed.refreshSeconds));
      }
      if (typeof parsed.autoRefresh === 'boolean') {
        state.settings.autoRefresh = parsed.autoRefresh;
      }
      if (typeof parsed.sidebarCollapsed === 'boolean') {
        state.settings.sidebarCollapsed = parsed.sidebarCollapsed;
      }
    }
  } catch {
    // ignore invalid local storage
  }
}

export function saveSettings(state) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}
