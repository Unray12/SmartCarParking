const { test, expect } = require('@playwright/test');

// Test này phải bắt đầu ở trạng thái CHƯA đăng nhập - override storageState
// mặc định của project (đã login sẵn từ global-setup.js).
test.use({ storageState: { cookies: [], origins: [] } });

const ADMIN_USER = process.env.TEST_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.TEST_ADMIN_PASS || 'admin';
// `request` fixture ở project "frontend" có baseURL là FRONTEND_URL (5173), không
// phải backend -> phải gọi thẳng URL đầy đủ của backend khi cần hit API ở đây.
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8010';

test.describe('Trang đăng nhập (login.html) + token-gate', () => {
  test('vào app khi chưa đăng nhập -> bị redirect về login.html', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForURL('**/login.html', { timeout: 10000 });
  });

  test('đăng nhập sai mật khẩu -> hiện lỗi, không rời trang', async ({ page }) => {
    await page.goto('/login.html');
    await page.fill('#loginUsername', ADMIN_USER);
    await page.fill('#loginPassword', 'sai-mat-khau-123');
    await page.click('#loginForm button[type="submit"]');
    await expect(page.locator('#loginError')).not.toBeEmpty();
    await expect(page).toHaveURL(/login\.html/);
  });

  test('đăng nhập đúng -> vào dashboard, thấy sidebar + tab Overview', async ({ page }) => {
    await page.goto('/login.html');
    await page.fill('#loginUsername', ADMIN_USER);
    await page.fill('#loginPassword', ADMIN_PASS);
    await page.click('#loginForm button[type="submit"]');
    await page.waitForURL('**/index.html', { timeout: 10000 });

    await expect(page.locator('#pageTitle')).toHaveText('Overview');
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('#userBadge')).toContainText(ADMIN_USER);
  });

  test('mở modal "Quên mật khẩu?" rồi đóng lại', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page.locator('#resetModal')).toHaveClass(/is-hidden/);

    await page.click('#showReset');
    await expect(page.locator('#resetModal')).not.toHaveClass(/is-hidden/);

    await page.click('#resetCancel');
    await expect(page.locator('#resetModal')).toHaveClass(/is-hidden/);
  });

  test('đặt lại mật khẩu qua modal -> đăng nhập lại được với mật khẩu mới rồi khôi phục', async ({ page, request }) => {
    const tempPassword = `UiTempPw_${Date.now()}`;
    try {
      await page.goto('/login.html');
      await page.click('#showReset');
      await page.fill('#resetUsername', ADMIN_USER);
      await page.fill('#resetNewPassword', tempPassword);
      await page.click('#resetForm button[type="submit"]');

      await expect(page.locator('#resetModal')).toHaveClass(/is-hidden/);
      await expect(page.locator('#loginOk')).toContainText('Đã đặt lại mật khẩu');

      await page.fill('#loginUsername', ADMIN_USER);
      await page.fill('#loginPassword', tempPassword);
      await page.click('#loginForm button[type="submit"]');
      await page.waitForURL('**/index.html', { timeout: 10000 });
    } finally {
      // Khôi phục lại mật khẩu gốc qua API trực tiếp (không cần UI) để không phá test khác.
      await request.post(`${BACKEND_URL}/api/v1/auth/reset-password`, {
        data: { username: ADMIN_USER, new_password: ADMIN_PASS },
      });
    }
  });
});
