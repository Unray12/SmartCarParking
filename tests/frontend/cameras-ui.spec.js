const { test, expect } = require('@playwright/test');
const { uniqueName } = require('../utils/test-data');
const { gotoView } = require('../utils/ui-helpers');

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await gotoView(page, 'cameras', 'Cameras');
});

test.describe('Cameras UI', () => {
  test('thêm camera mới qua form -> xuất hiện trong grid, rồi xóa qua confirm dialog', async ({ page }) => {
    const name = uniqueName('UI_Cam');
    await page.fill('#cameraName', name);
    await page.fill('#cameraUrl', 'rtsp://example.invalid/ui-test');
    await page.click('#cameraForm button[type="submit"]');

    const card = page.locator('.camera-card', { hasText: name });
    await expect(card).toBeVisible();
    await expect(card.locator('.status')).toHaveText('Live'); // enabled=true theo default form

    page.once('dialog', (dialog) => dialog.accept());
    await card.locator('button:has-text("Xóa")').click();
    await expect(page.locator('.camera-card', { hasText: name })).toHaveCount(0);
  });

  test('sửa camera qua modal edit', async ({ page }) => {
    const name = uniqueName('UI_Cam_Edit');
    await page.fill('#cameraName', name);
    await page.fill('#cameraUrl', 'rtsp://example.invalid/ui-edit');
    await page.click('#cameraForm button[type="submit"]');

    const card = page.locator('.camera-card', { hasText: name });
    await expect(card).toBeVisible();

    const newName = `${name}_renamed`;
    await card.locator('button:has-text("Sửa")').click();
    await expect(page.locator('#cameraEditModal')).not.toHaveClass(/is-hidden/);
    await page.fill('#cameraEditName', newName);
    await page.click('#cameraEditForm button[type="submit"]');

    await expect(page.locator('#cameraEditModal')).toHaveClass(/is-hidden/);
    const renamedCard = page.locator('.camera-card', { hasText: newName });
    await expect(renamedCard).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await renamedCard.locator('button:has-text("Xóa")').click();
  });

  test('bấm toggle bật/tắt camera', async ({ page }) => {
    const name = uniqueName('UI_Cam_Toggle');
    await page.fill('#cameraName', name);
    await page.fill('#cameraUrl', 'rtsp://example.invalid/ui-toggle');
    await page.click('#cameraForm button[type="submit"]');

    const card = page.locator('.camera-card', { hasText: name });
    await expect(card.locator('.toggle')).toHaveClass(/on/);

    await card.locator('.toggle').click();
    await expect(card.locator('.toggle')).not.toHaveClass(/on/);

    page.once('dialog', (dialog) => dialog.accept());
    await card.locator('button:has-text("Xóa")').click();
  });

  test('hủy dialog xác nhận -> camera KHÔNG bị xóa', async ({ page }) => {
    const name = uniqueName('UI_Cam_KeepMe');
    await page.fill('#cameraName', name);
    await page.fill('#cameraUrl', 'rtsp://example.invalid/ui-keep');
    await page.click('#cameraForm button[type="submit"]');

    const card = page.locator('.camera-card', { hasText: name });
    await expect(card).toBeVisible();

    page.once('dialog', (dialog) => dialog.dismiss());
    await card.locator('button:has-text("Xóa")').click();
    await expect(page.locator('.camera-card', { hasText: name })).toBeVisible();

    // Dọn dẹp thật cho sạch dữ liệu test.
    page.once('dialog', (dialog) => dialog.accept());
    await card.locator('button:has-text("Xóa")').click();
  });
});
