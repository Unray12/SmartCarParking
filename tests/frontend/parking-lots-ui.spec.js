const { test, expect } = require('@playwright/test');
const { uniqueName } = require('../utils/test-data');
const { gotoView } = require('../utils/ui-helpers');

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await gotoView(page, 'parking', 'Parking Lots');
});

test.describe('Parking Lots UI', () => {
  test('tạo bãi xe mới qua form -> xuất hiện trong bảng, rồi xóa', async ({ page }) => {
    const name = uniqueName('UI_Lot');
    await page.fill('#lotName', name);
    await page.fill('#lotCapacity', '30');
    await page.click('#lotSubmitBtn');

    const row = page.locator('#lotBody tr', { hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText('30');

    page.once('dialog', (dialog) => dialog.accept());
    await row.locator('.lot-delete-btn').click();
    await expect(page.locator('#lotBody tr', { hasText: name })).toHaveCount(0);
  });

  test('sửa bãi xe qua form (chế độ edit) -> đổi sức chứa', async ({ page }) => {
    const name = uniqueName('UI_Lot_Edit');
    await page.fill('#lotName', name);
    await page.fill('#lotCapacity', '10');
    await page.click('#lotSubmitBtn');

    const row = page.locator('#lotBody tr', { hasText: name });
    await expect(row).toBeVisible();

    await row.locator('.lot-edit-btn').click();
    await expect(page.locator('#lotFormTitle')).toContainText('Sửa bãi xe');
    await page.fill('#lotCapacity', '99');
    await page.click('#lotSubmitBtn');

    await expect(page.locator('#lotBody tr', { hasText: name })).toContainText('99');

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#lotBody tr', { hasText: name }).locator('.lot-delete-btn').click();
  });

  test('hủy sửa (nút Hủy sửa) -> form trở lại chế độ tạo mới', async ({ page }) => {
    const name = uniqueName('UI_Lot_CancelEdit');
    await page.fill('#lotName', name);
    await page.fill('#lotCapacity', '5');
    await page.click('#lotSubmitBtn');

    const row = page.locator('#lotBody tr', { hasText: name });
    await row.locator('.lot-edit-btn').click();
    await expect(page.locator('#lotFormTitle')).toContainText('Sửa bãi xe');

    await page.click('#lotCancelEditBtn');
    await expect(page.locator('#lotFormTitle')).toHaveText('Tạo bãi xe');
    await expect(page.locator('#lotName')).toHaveValue('');

    page.once('dialog', (dialog) => dialog.accept());
    await row.locator('.lot-delete-btn').click();
  });

  test('mở chi tiết bãi xe qua nút "Quản lý"', async ({ page }) => {
    const name = uniqueName('UI_Lot_Detail');
    await page.fill('#lotName', name);
    await page.fill('#lotCapacity', '15');
    await page.click('#lotSubmitBtn');

    const row = page.locator('#lotBody tr', { hasText: name });
    await row.locator('.lot-manage-btn').click();

    await expect(page.locator('#lotDetailTitle')).toContainText(name);
    await expect(page.locator('#lotDetailMeta')).not.toContainText('Chọn bãi xe từ danh sách');

    await page.click('#lotDetailCloseBtn');
    await expect(page.locator('#lotDetailTitle')).toHaveText('Chi tiết bãi xe');

    page.once('dialog', (dialog) => dialog.accept());
    await row.locator('.lot-delete-btn').click();
  });
});
