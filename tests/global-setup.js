// Chạy 1 lần trước toàn bộ test suite: đăng nhập thật qua UI (login.html) rồi
// lưu lại storageState (chứa token trong localStorage) để các test frontend cần
// vào thẳng dashboard (index.html) không phải đăng nhập lại mỗi file.
// login.spec.js tự override `storageState: {cookies:[], origins:[]}` để test
// đúng luồng CHƯA đăng nhập, không dùng state này.
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

module.exports = async function globalSetup() {
  const frontendURL = process.env.FRONTEND_URL || 'http://localhost:5173';
  const username = process.env.TEST_ADMIN_USER || 'admin';
  const password = process.env.TEST_ADMIN_PASS || 'admin';

  const authDir = path.join(__dirname, '.auth');
  fs.mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${frontendURL}/login.html`, { waitUntil: 'networkidle' });
  await page.fill('#loginUsername', username);
  await page.fill('#loginPassword', password);
  await page.click('#loginForm button[type="submit"]');
  await page.waitForURL('**/index.html', { timeout: 15000 });

  await page.context().storageState({ path: path.join(authDir, 'storageState.json') });
  await browser.close();
};
