// Helper dùng chung cho các test backend (API) - đăng nhập lấy JWT + build header.
// Mỗi spec file tự login riêng (không chia sẻ token qua file) để tránh phụ thuộc
// thứ tự chạy giữa các worker; vì suite chạy `workers: 1` (xem playwright.config.js)
// nên việc login lại nhiều lần chỉ tốn vài chục ms, không đáng kể.

async function login(request, { username, password } = {}) {
  const user = username || process.env.TEST_ADMIN_USER || 'admin';
  const pass = password || process.env.TEST_ADMIN_PASS || 'admin';

  const res = await request.post('/api/v1/auth/login', {
    data: { username: user, password: pass },
  });
  if (!res.ok()) {
    throw new Error(`Login thất bại: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  return body.access_token;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = { login, authHeaders };
