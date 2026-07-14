const { test, expect } = require('@playwright/test');

const ADMIN_USER = process.env.TEST_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.TEST_ADMIN_PASS || 'admin';

test.describe('Auth (/api/v1/auth) + bảo vệ JWT', () => {
  test('login đúng tài khoản -> 200, trả JWT hợp lệ', async ({ request }) => {
    const res = await request.post('/api/v1/auth/login', {
      data: { username: ADMIN_USER, password: ADMIN_PASS },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.token_type).toBe('bearer');
    expect(typeof body.access_token).toBe('string');
    expect(body.access_token.length).toBeGreaterThan(20);
    expect(body.username).toBe(ADMIN_USER);
    expect(body.expires_in).toBeGreaterThan(0);
  });

  test('login sai mật khẩu -> 401', async ({ request }) => {
    const res = await request.post('/api/v1/auth/login', {
      data: { username: ADMIN_USER, password: 'mat-khau-sai' },
    });
    expect(res.status()).toBe(401);
  });

  test('login sai tên đăng nhập -> 401', async ({ request }) => {
    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'khong-ton-tai', password: ADMIN_PASS },
    });
    expect(res.status()).toBe(401);
  });

  test('login thiếu field -> 422 (pydantic validation)', async ({ request }) => {
    const res = await request.post('/api/v1/auth/login', { data: { username: ADMIN_USER } });
    expect(res.status()).toBe(422);
  });

  test('GET /me không có token -> 401', async ({ request }) => {
    const res = await request.get('/api/v1/auth/me');
    expect(res.status()).toBe(401);
  });

  test('GET /me với token hợp lệ -> 200, đúng username', async ({ request }) => {
    const login = await request.post('/api/v1/auth/login', {
      data: { username: ADMIN_USER, password: ADMIN_PASS },
    });
    const { access_token } = await login.json();

    const res = await request.get('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).username).toBe(ADMIN_USER);
  });

  test('GET /me với token rác -> 401', async ({ request }) => {
    const res = await request.get('/api/v1/auth/me', {
      headers: { Authorization: 'Bearer garbage.token.value' },
    });
    expect(res.status()).toBe(401);
  });

  test('API nghiệp vụ bất kỳ không token -> 401 (bảo vệ tập trung)', async ({ request }) => {
    for (const path of ['/api/v1/cameras', '/api/v1/parking-lots', '/api/v1/sessions', '/api/v1/dashboard/summary']) {
      const res = await request.get(path);
      expect(res.status(), `${path} phải trả 401 khi không có token`).toBe(401);
    }
  });

  test('đổi mật khẩu sai mật khẩu cũ -> 400, không đổi gì', async ({ request }) => {
    const login = await request.post('/api/v1/auth/login', {
      data: { username: ADMIN_USER, password: ADMIN_PASS },
    });
    const { access_token } = await login.json();

    const res = await request.post('/api/v1/auth/change-password', {
      headers: { Authorization: `Bearer ${access_token}` },
      data: { old_password: 'day-la-sai', new_password: 'khong-quan-trong-123' },
    });
    expect(res.status()).toBe(400);

    const verify = await request.post('/api/v1/auth/login', {
      data: { username: ADMIN_USER, password: ADMIN_PASS },
    });
    expect(verify.status()).toBe(200);
  });

  test('đổi mật khẩu đúng -> login được với mật khẩu mới, rồi khôi phục lại admin/admin', async ({ request }) => {
    const tempPassword = `TempPw_${Date.now()}`;
    const login = await request.post('/api/v1/auth/login', {
      data: { username: ADMIN_USER, password: ADMIN_PASS },
    });
    const { access_token } = await login.json();

    try {
      const changeRes = await request.post('/api/v1/auth/change-password', {
        headers: { Authorization: `Bearer ${access_token}` },
        data: { old_password: ADMIN_PASS, new_password: tempPassword },
      });
      expect(changeRes.status()).toBe(200);

      const loginWithNew = await request.post('/api/v1/auth/login', {
        data: { username: ADMIN_USER, password: tempPassword },
      });
      expect(loginWithNew.status()).toBe(200);

      const loginWithOld = await request.post('/api/v1/auth/login', {
        data: { username: ADMIN_USER, password: ADMIN_PASS },
      });
      expect(loginWithOld.status()).toBe(401);
    } finally {
      // BẮT BUỘC khôi phục lại mật khẩu gốc dù test có fail giữa đường, vì mọi
      // spec file khác (cameras/parking-lots/...) đều login bằng admin/admin.
      await request.post('/api/v1/auth/reset-password', {
        data: { username: ADMIN_USER, new_password: ADMIN_PASS },
      });
    }

    const verify = await request.post('/api/v1/auth/login', {
      data: { username: ADMIN_USER, password: ADMIN_PASS },
    });
    expect(verify.status()).toBe(200);
  });

  test('reset mật khẩu cho user không tồn tại -> 404', async ({ request }) => {
    const res = await request.post('/api/v1/auth/reset-password', {
      data: { username: `no_such_user_${Date.now()}`, new_password: 'x' },
    });
    expect(res.status()).toBe(404);
  });
});
