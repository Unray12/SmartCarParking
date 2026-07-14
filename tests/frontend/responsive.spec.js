const { test, expect } = require('@playwright/test');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Kiểm tra lại cơ chế tự scale UI theo màn hình máy tính (styles.css - root
// font-size clamp(14px, 0.55vw + 8.5px, 19px) + breakpoint 1600/1920/2560px).
// Giá trị expectedFontSize tính trực tiếp từ công thức clamp() đó.
const SIZES = [
  { name: 'laptop-1366', width: 1366, height: 768, expectedFontSize: 16.01 },
  { name: 'fhd-1920', width: 1920, height: 1080, expectedFontSize: 19 }, // đã kịch max clamp
  { name: 'qhd-2560', width: 2560, height: 1440, expectedFontSize: 19 }, // vẫn max clamp
];

test.describe('Responsive scale trên màn hình máy tính', () => {
  for (const size of SIZES) {
    test(`${size.name}: root font-size đúng công thức, content dán liền sidebar, không lỗi console`, async ({ page }) => {
      const errors = [];
      // Chỉ tính lỗi JS thật (pageerror) - console 'error' còn gồm cả cảnh báo
      // network (ví dụ favicon.ico 404) không liên quan tới scale/layout.
      page.on('pageerror', (err) => errors.push(String(err)));

      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/index.html');
      await expect(page.locator('#pageTitle')).toHaveText('Overview');

      const rootFontSize = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
      expect(rootFontSize).toBeCloseTo(size.expectedFontSize, 0);

      const sidebarBox = await page.locator('.sidebar').boundingBox();
      const contentBox = await page.locator('.content').boundingBox();
      expect(sidebarBox).toBeTruthy();
      expect(contentBox).toBeTruthy();
      // content phải bắt đầu ngay sau sidebar (không có khoảng trống mồ côi ở giữa).
      expect(Math.abs(contentBox.x - (sidebarBox.x + sidebarBox.width))).toBeLessThan(1);

      expect(errors).toEqual([]);
    });
  }

  test('màn nhỏ (1366) có root font-size nhỏ hơn màn lớn (2560) - fluid scale hoạt động', async ({ browser }) => {
    // Dùng 2 page độc lập (mỗi page set viewport ngay lúc tạo) để tránh việc
    // resize + reload liên tiếp trên cùng 1 page có thể chưa kịp áp dụng layout mới.
    const pageSmall = await (await browser.newContext({ viewport: { width: 1366, height: 768 }, baseURL: FRONTEND_URL })).newPage();
    const pageLarge = await (await browser.newContext({ viewport: { width: 2560, height: 1440 }, baseURL: FRONTEND_URL })).newPage();

    await pageSmall.goto('/index.html');
    await pageLarge.goto('/index.html');

    const small = await pageSmall.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    const large = await pageLarge.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));

    expect(large).toBeGreaterThan(small);

    await pageSmall.context().close();
    await pageLarge.context().close();
  });
});
