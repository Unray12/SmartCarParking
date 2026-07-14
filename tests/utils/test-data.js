// Sinh tên/định danh duy nhất cho mỗi lần chạy test để không đụng dữ liệu giữa
// các lần chạy (không dùng Date.now()/Math.random() bừa - chỉ để tạo tên, không
// phải logic nghiệp vụ, nên an toàn dùng trực tiếp ở đây).
function uniqueName(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

// Khớp state.js -> VIEW_META (frontend). Dùng để test điều hướng sidebar đầy đủ
// từng tab, đối chiếu đúng tiêu đề hiển thị trên #pageTitle.
const VIEWS = [
  { key: 'overview', title: 'Overview' },
  { key: 'cameras', title: 'Cameras' },
  { key: 'parking', title: 'Parking Lots' },
  { key: 'sessions', title: 'Sessions' },
  { key: 'plates', title: 'Plate Reads' },
  { key: 'reports', title: 'Reports' },
  { key: 'logs', title: 'Logs' },
  { key: 'rfid', title: 'RFID Cards' },
  { key: 'ai', title: 'AI Center' },
  { key: 'settings', title: 'Settings' },
  { key: 'system', title: 'System' },
  { key: 'user', title: 'User' },
];

module.exports = { uniqueName, VIEWS };
