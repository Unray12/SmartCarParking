// Tiện ích UI dùng chung: thông báo, toast, format, occupancy helpers.
import { API_BASE, getToken } from './api.js';
import { appState } from './state.js';
import { els } from './dom.js';

let noticeTimeout = null;
let scanTickTimeout = null;

// Escape trước khi nội suy vào innerHTML - các field như tên bãi/tên camera/card_id/
// owner_name là text người dùng tự nhập tự do (không giới hạn ký tự), nếu chèn thẳng vào
// innerHTML sẽ dính stored XSS (ví dụ đặt tên bãi là "<img src=x onerror=...>").
const HTML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

// Nhãn trạng thái luồng camera dùng CHUNG cho mọi nơi hiển thị (card, phóng lớn, chi tiết
// bãi) để đồng bộ - stream.js phát mode qua onMode, các view gọi setStreamStatusChip.
export const STREAM_STATUS_LABELS = {
  connecting: 'Đang kết nối…',
  webrtc: 'WebRTC',
  jpeg: 'JPEG',
  error: 'Mất kết nối'
};

// Cập nhật 1 chip trạng thái luồng (span.stream-status). mode = null -> ẩn chip.
export function setStreamStatusChip(el, mode) {
  if (!el) return;
  el.className = `stream-status ${mode ? `mode-${mode}` : 'mode-none'}`;
  el.textContent = mode ? (STREAM_STATUS_LABELS[mode] || '') : '';
}

export function notify(message, type = 'info') {
  els.globalNotice.textContent = message;
  els.globalNotice.className = `notice ${type === 'info' ? '' : type}`.trim();

  if (noticeTimeout) clearTimeout(noticeTimeout);
  if (type !== 'error') {
    noticeTimeout = setTimeout(() => {
      els.globalNotice.className = 'notice';
    }, 2800);
  }
}

// Chống double-submit + phản hồi "đang xử lý": vô hiệu hoá nút trong lúc chạy tác vụ async,
// đổi nhãn tạm thời, luôn phục hồi ở finally (kể cả khi lỗi). Trả về kết quả của fn.
export async function withButtonBusy(button, busyLabel, fn) {
  if (!button) return fn();
  const prevLabel = button.textContent;
  const prevDisabled = button.disabled;
  button.disabled = true;
  if (busyLabel) button.textContent = busyLabel;
  try {
    return await fn();
  } finally {
    button.disabled = prevDisabled;
    button.textContent = prevLabel;
  }
}

export function showScanTick(message = 'Quét RFID thành công') {
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

  if (scanTickTimeout) clearTimeout(scanTickTimeout);
  scanTickTimeout = setTimeout(() => {
    els.scanTickToast.classList.remove('is-show');
    els.scanTickToast.setAttribute('aria-hidden', 'true');
  }, 1800);
}

export function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('vi-VN', { hour12: false });
}

export function fmtMoney(amount, currency = '') {
  const n = Number(amount || 0);
  return `${n.toLocaleString('vi-VN')}${currency ? ' ' + currency : ''}`;
}

export function fmtDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes || 0)));
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h${String(rem).padStart(2, '0')}` : `${h}h`;
}

// Ảnh snapshot giờ yêu cầu token (backend đã bỏ endpoint public hoàn toàn) - <img src>
// không tự gắn được header Authorization nên phải đính token qua query string ?token=.
function withToken(url) {
  const token = getToken();
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

export function absoluteApiUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return withToken(path);
  return withToken(`${API_BASE}${path}`);
}

export function absoluteApiUrlNoCache(path) {
  const base = absoluteApiUrl(path);
  if (!base) return '';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}_ts=${Date.now()}`;
}

export function cameraNameById(cameraId) {
  const cam = appState.cameras.find((x) => x.id === cameraId);
  return cam ? `${cam.name} (#${cam.id})` : '-';
}

export function occRate(occupied, capacity) {
  const cap = Number(capacity || 0);
  if (cap <= 0) return 0;
  return Math.min(100, Math.round((Number(occupied || 0) / cap) * 100));
}

export function occClass(rate) {
  if (rate >= 90) return 'is-high';
  if (rate >= 60) return 'is-mid';
  return '';
}
