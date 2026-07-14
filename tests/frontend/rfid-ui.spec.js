const { test, expect } = require('@playwright/test');
const { uniqueName } = require('../utils/test-data');
const { gotoView } = require('../utils/ui-helpers');

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await gotoView(page, 'rfid', 'RFID Cards');
});

test.describe('RFID UI', () => {
  test('thêm thẻ RFID mới qua form -> xuất hiện trong bảng, rồi xóa', async ({ page }) => {
    const cardId = uniqueName('UI_CARD').toUpperCase();
    await page.fill('#rfidCardId', cardId);
    await page.fill('#rfidCardPlate', 'UI999');
    await page.click('#rfidCardForm button[type="submit"]');

    const row = page.locator('#rfidCardBody tr', { hasText: cardId });
    await expect(row).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await row.locator('.delete-card-btn').click();
    await expect(page.locator('#rfidCardBody tr', { hasText: cardId })).toHaveCount(0);
  });

  test('gửi sự kiện RFID check-in rồi check-out qua form test', async ({ page }) => {
    const cardId = uniqueName('UI_EVT').toUpperCase();

    await page.fill('#rfidCard', cardId);
    await page.selectOption('#rfidDirection', 'in');
    await page.fill('#rfidPlate', 'UIEVT01');
    await page.click('#rfidForm button[type="submit"]');

    await expect(page.locator('#globalNotice')).toContainText('checked_in');
    await expect(page.locator('#rfidLogBody')).toContainText(cardId);

    await page.fill('#rfidCard', cardId);
    await page.selectOption('#rfidDirection', 'out');
    await page.click('#rfidForm button[type="submit"]');
    await expect(page.locator('#globalNotice')).toContainText('checked_out');
  });
});
