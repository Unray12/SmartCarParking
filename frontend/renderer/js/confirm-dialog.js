// Modal xác nhận dùng chung, thay cho window.confirm()/alert() (native, không style được).
// Dùng: await confirmDialog({ title, message, tone: 'warn'|'danger', confirmText, cancelText })
// -> true (đã xác nhận) / false (Hủy, Esc, click ngoài, hoặc bấm Đóng).
import { els } from './dom.js';

let activeResolve = null;

function close(result) {
  els.confirmModal.classList.add('is-hidden');
  const resolve = activeResolve;
  activeResolve = null;
  resolve?.(result);
}

export function confirmDialog({
  title = 'Xác nhận',
  message = '',
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  tone = 'warn',
} = {}) {
  // Chỉ 1 dialog tại 1 thời điểm - nếu đang mở dialog khác thì đóng nó như bị Hủy trước khi mở dialog mới.
  if (activeResolve) close(false);

  els.confirmModalTitle.textContent = title;
  els.confirmModalMessage.textContent = message;
  els.confirmModalConfirmBtn.textContent = confirmText;
  els.confirmModalCancelBtn.textContent = cancelText;
  els.confirmModalIcon.textContent = tone === 'danger' ? '⛔' : '⚠️';
  els.confirmModalIcon.className = `confirm-icon is-${tone}`;
  els.confirmModal.classList.remove('is-hidden');
  els.confirmModalConfirmBtn.focus();

  return new Promise((resolve) => {
    activeResolve = resolve;
  });
}

export function initConfirmDialog() {
  els.confirmModalConfirmBtn.addEventListener('click', () => close(true));
  els.confirmModalCancelBtn.addEventListener('click', () => close(false));
  els.confirmModalCloseBtn.addEventListener('click', () => close(false));
  els.confirmModal.addEventListener('click', (ev) => {
    if (ev.target === els.confirmModal) close(false);
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !els.confirmModal.classList.contains('is-hidden')) close(false);
  });
}
