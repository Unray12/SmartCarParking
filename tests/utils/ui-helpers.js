const { expect } = require('@playwright/test');

// Click nav-item rồi đợi #pageTitle đổi đúng; retry vài lần nếu click "trượt"
// do máy đang tải nặng (nhiều test/container chạy song song trong 1 lần suite
// dài) - không che giấu bug thật: nếu view thật sự không chuyển được (bug ở
// switchView), sau 3 lần retry vẫn fail và ném lỗi rõ ràng.
async function gotoView(page, viewKey, title) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.click(`.nav-item[data-view="${viewKey}"]`);
    try {
      await expect(page.locator('#pageTitle')).toHaveText(title, { timeout: 3000 });
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Không chuyển được sang tab "${viewKey}" sau 3 lần click: ${lastError}`);
}

module.exports = { gotoView };
