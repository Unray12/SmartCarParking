export const VIEW_META = {
  overview: {
    title: 'Overview',
    desc: 'Tổng quan hệ thống: chỉ số realtime, tỉ lệ lấp đầy và hoạt động gần đây.'
  },
  cameras: {
    title: 'Cameras',
    desc: 'Quản lý toàn bộ camera: thêm/sửa/xóa, bật/tắt, xem live và phóng lớn.'
  },
  parking: {
    title: 'Parking Lots',
    desc: 'Tạo bãi xe, chỉ định camera cổng vào/ra, theo dõi sức chứa và ảnh chụp.'
  },
  sessions: {
    title: 'Sessions',
    desc: 'Lịch sử phiên gửi xe, thời gian gửi và phí theo từng lượt.'
  },
  plates: {
    title: 'Plate Reads',
    desc: 'Lịch sử nhận diện biển số từ camera ANPR.'
  },
  reports: {
    title: 'Reports',
    desc: 'Thống kê lượt vào/ra, giờ cao điểm, thời gian gửi trung bình và doanh thu.'
  },
  logs: {
    title: 'Logs',
    desc: 'Nhật ký sự kiện hệ thống: RFID, nhận diện biển số, xe vào/ra.'
  },
  rfid: {
    title: 'RFID Cards',
    desc: 'Quản lý thẻ RFID và gửi sự kiện test luồng vào/ra.'
  },
  ai: {
    title: 'AI Center',
    desc: 'Upload model nhận diện và test trên camera đang chạy.'
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
  currentView: 'overview',
  cameras: [],
  focusedCameraId: null,
  rfidLogs: [],
  rfidCards: [],
  parkingLots: [],
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
