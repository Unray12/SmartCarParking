const { test, expect } = require('@playwright/test');
const { login, authHeaders } = require('../utils/backend-client');

test.describe('Dashboard API (/api/v1/dashboard)', () => {
  let headers;

  test.beforeAll(async ({ request }) => {
    headers = authHeaders(await login(request));
  });

  test('GET /summary trả đủ field, occupancy_rate hợp lệ', async ({ request }) => {
    const res = await request.get('/api/v1/dashboard/summary', { headers });
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const key of [
      'cameras_total', 'cameras_enabled', 'active_sessions',
      'today_checkins', 'today_checkouts', 'total_capacity',
      'total_occupied', 'occupancy_rate', 'today_revenue', 'currency',
    ]) {
      expect(body, `thiếu field "${key}"`).toHaveProperty(key);
    }
    expect(body.occupancy_rate).toBeGreaterThanOrEqual(0);
    expect(body.occupancy_rate).toBeLessThanOrEqual(100);
  });

  test('GET /stats?days=7 trả đủ 7 điểm daily + 24 giờ by_hour', async ({ request }) => {
    const res = await request.get('/api/v1/dashboard/stats?days=7', { headers });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.days).toBe(7);
    expect(body.daily.length).toBe(7);
    expect(body.by_hour.length).toBe(24);
    expect(body.total_sessions).toBeGreaterThanOrEqual(0);
  });

  test('GET /stats?days=30 hoạt động với khoảng ngày khác', async ({ request }) => {
    const res = await request.get('/api/v1/dashboard/stats?days=30', { headers });
    expect(res.status()).toBe(200);
    expect((await res.json()).daily.length).toBe(30);
  });

  test('không token -> 401 cho cả summary và stats', async ({ request }) => {
    expect((await request.get('/api/v1/dashboard/summary')).status()).toBe(401);
    expect((await request.get('/api/v1/dashboard/stats?days=7')).status()).toBe(401);
  });
});
