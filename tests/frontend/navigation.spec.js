const { test, expect } = require('@playwright/test');
const { VIEWS } = require('../utils/test-data');
const { gotoView } = require('../utils/ui-helpers');

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Overview');
});

test.describe('Điều hướng sidebar - đủ toàn bộ tab', () => {
  for (const view of VIEWS) {
    test(`chuyển sang "${view.key}" -> tiêu đề "${view.title}", panel + nav-item active đúng`, async ({ page }) => {
      await gotoView(page, view.key, view.title);
      await expect(page.locator(`.view[data-view-panel="${view.key}"]`)).toHaveClass(/is-active/);
      await expect(page.locator(`.nav-item[data-view="${view.key}"]`)).toHaveClass(/is-active/);
      // Chỉ 1 panel active tại 1 thời điểm.
      await expect(page.locator('.view.is-active')).toHaveCount(1);
    });
  }

  test('không có lỗi JS (uncaught exception) khi đi qua hết các tab', async ({ page }) => {
    // Dùng `pageerror` (uncaught exception thật) thay vì console 'error' - console
    // 'error' còn bắt cả cảnh báo network không liên quan (ví dụ favicon 404).
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    for (const view of VIEWS) {
      await gotoView(page, view.key, view.title);
    }
    expect(errors).toEqual([]);
  });
});

test.describe('Sidebar thu/mở', () => {
  test('bấm nút toggle -> sidebar ẩn, bấm lại -> hiện lại', async ({ page }) => {
    await page.click('#sidebarToggleBtn');
    await expect(page.locator('#appShell')).toHaveClass(/sidebar-hidden/);

    await page.click('#sidebarExpandBtn');
    await expect(page.locator('#appShell')).not.toHaveClass(/sidebar-hidden/);
  });
});
