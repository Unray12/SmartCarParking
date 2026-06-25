import { api, setToken, getToken, API_BASE } from './api.js';

const el = (id) => document.getElementById(id);

const loginForm = el('loginForm');
const resetForm = el('resetForm');
const resetModal = el('resetModal');

function setBusy(form, busy, idleText) {
  const btn = form.querySelector('button[type="submit"]');
  if (!btn) return;
  if (!btn.dataset.idle) btn.dataset.idle = btn.textContent;
  btn.disabled = busy;
  btn.textContent = busy ? 'Đang xử lý...' : (idleText || btn.dataset.idle);
}

function friendlyError(message) {
  const msg = String(message || '').trim();
  if (!msg) return 'Đăng nhập thất bại.';
  if (msg.includes('Failed to fetch')) return `Không kết nối được backend (${API_BASE}).`;
  if (msg.includes('Request timeout')) return 'Kết nối backend quá chậm (timeout), thử lại.';
  return msg;
}

function openReset() {
  el('resetError').textContent = '';
  resetForm.reset();
  resetModal.classList.remove('is-hidden');
  el('resetUsername').focus();
}

function closeReset() {
  resetModal.classList.add('is-hidden');
}

// Nếu đã có token, vào thẳng app (app tự kiểm tra /me và đẩy lại nếu hết hạn).
if (getToken()) {
  window.location.replace('/');
}

loginForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  el('loginError').textContent = '';
  const username = el('loginUsername').value.trim();
  const password = el('loginPassword').value;
  if (!username || !password) {
    el('loginError').textContent = 'Nhập đầy đủ tên đăng nhập và mật khẩu.';
    return;
  }
  setBusy(loginForm, true);
  try {
    const res = await api('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    setToken(res.access_token, res.username);
    window.location.replace('/');
  } catch (err) {
    el('loginError').textContent = friendlyError(err?.message);
  } finally {
    setBusy(loginForm, false);
  }
});

el('showReset').addEventListener('click', openReset);
el('resetClose').addEventListener('click', closeReset);
el('resetCancel').addEventListener('click', closeReset);
resetModal.addEventListener('click', (ev) => {
  if (ev.target === resetModal) closeReset();
});
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !resetModal.classList.contains('is-hidden')) closeReset();
});

resetForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  el('resetError').textContent = '';
  const username = el('resetUsername').value.trim();
  const newPassword = el('resetNewPassword').value;
  if (!username || !newPassword) {
    el('resetError').textContent = 'Nhập đầy đủ tên đăng nhập và mật khẩu mới.';
    return;
  }
  setBusy(resetForm, true);
  try {
    await api('/api/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ username, new_password: newPassword })
    });
    closeReset();
    el('loginUsername').value = username;
    el('loginPassword').value = '';
    el('loginPassword').focus();
    el('loginOk').textContent = `Đã đặt lại mật khẩu cho "${username}". Hãy đăng nhập.`;
  } catch (err) {
    el('resetError').textContent = friendlyError(err?.message);
  } finally {
    setBusy(resetForm, false);
  }
});
