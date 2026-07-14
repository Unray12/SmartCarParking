// @ts-check
const path = require('path');
const { defineConfig } = require('@playwright/test');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8010';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

module.exports = defineConfig({
  timeout: 30_000,
  expect: { timeout: 8_000 },
  // Suite này test thẳng vào 1 backend + 1 Postgres THẬT (không mock), nhiều
  // test tạo/sửa/xóa cùng loại dữ liệu (camera, bãi xe, thẻ RFID, mật khẩu
  // admin...) -> chạy song song sẽ đụng dữ liệu nhau. Chạy tuần tự (1 worker)
  // để kết quả ổn định, đổi lại chậm hơn - chấp nhận được với quy mô suite này.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: require.resolve('./global-setup.js'),
  projects: [
    {
      name: 'backend',
      testDir: './backend',
      use: {
        baseURL: BACKEND_URL,
      },
    },
    {
      name: 'frontend',
      testDir: './frontend',
      use: {
        baseURL: FRONTEND_URL,
        storageState: path.join(__dirname, '.auth', 'storageState.json'),
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
