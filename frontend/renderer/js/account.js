// Tài khoản: trạng thái đăng nhập, đổi/đặt lại mật khẩu, đăng xuất.
import { api, getToken, clearToken } from './api.js';
import { appState } from './state.js';
import { els } from './dom.js';
import { notify } from './ui.js';

export function isAuthenticated() {
  return Boolean(getToken());
}

export function goToLogin() {
  // Đường dẫn tương đối để chạy được cả khi FE tĩnh (5173) lẫn BE serve (8010).
  window.location.replace('login.html');
}

export function renderUserState() {
  const isLogged = Boolean(appState.user.username);
  els.userBadge.textContent = isLogged ? `User: ${appState.user.username}` : 'Guest';
  els.userStateText.textContent = isLogged
    ? `Đang đăng nhập bằng tài khoản: ${appState.user.username}`
    : 'Chưa đăng nhập.';
  els.logoutBtn.disabled = !isLogged;
}

// hooks.onLogout: dọn dẹp app (dừng polling/stream) trước khi rời trang.
export function initAccount(hooks = {}) {
  // Đổi mật khẩu (cần mật khẩu hiện tại)
  els.changePwForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    els.cpError.textContent = '';
    const oldPw = els.cpOld.value;
    const newPw = els.cpNew.value;
    const confirmPw = els.cpConfirm.value;
    if (!oldPw || !newPw) {
      els.cpError.textContent = 'Nhập đầy đủ mật khẩu.';
      return;
    }
    if (newPw !== confirmPw) {
      els.cpError.textContent = 'Mật khẩu mới không khớp.';
      return;
    }
    try {
      await api('/api/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ old_password: oldPw, new_password: newPw })
      });
      els.changePwForm.reset();
      notify('Đổi mật khẩu thành công', 'success');
    } catch (err) {
      els.cpError.textContent = err.message;
      notify(`Đổi mật khẩu lỗi: ${err.message}`, 'error');
    }
  });

  // Đặt lại mật khẩu (quản trị, không điều kiện)
  els.resetPwForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    els.resetError.textContent = '';
    const username = els.resetUser.value.trim();
    const newPw = els.resetNew.value;
    if (!username || !newPw) {
      els.resetError.textContent = 'Nhập đầy đủ tên đăng nhập và mật khẩu mới.';
      return;
    }
    try {
      await api('/api/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ username, new_password: newPw })
      });
      els.resetPwForm.reset();
      notify(`Đã đặt lại mật khẩu cho ${username}`, 'success');
    } catch (err) {
      els.resetError.textContent = err.message;
      notify(`Đặt lại mật khẩu lỗi: ${err.message}`, 'error');
    }
  });

  els.logoutBtn.addEventListener('click', () => {
    hooks.onLogout?.();
    appState.user.username = '';
    clearToken();
    notify('Đã đăng xuất', 'success');
    goToLogin();
  });
}
