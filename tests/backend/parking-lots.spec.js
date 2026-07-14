const { test, expect } = require('@playwright/test');
const { login, authHeaders } = require('../utils/backend-client');
const { uniqueName } = require('../utils/test-data');

test.describe('Parking lots API (/api/v1/parking-lots)', () => {
  let headers;
  let lotId;

  test.beforeAll(async ({ request }) => {
    headers = authHeaders(await login(request));
  });

  test.afterAll(async ({ request }) => {
    if (lotId) await request.delete(`/api/v1/parking-lots/${lotId}`, { headers });
  });

  test('tạo bãi xe -> occupied=0, available=capacity', async ({ request }) => {
    const name = uniqueName('E2E_Lot');
    const res = await request.post('/api/v1/parking-lots', {
      headers,
      data: { name, capacity: 25 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.name).toBe(name);
    expect(body.capacity).toBe(25);
    expect(body.is_active).toBe(true);
    lotId = body.id;
  });

  test('danh sách bãi xe chứa bãi vừa tạo, occupied/available tính đúng', async ({ request }) => {
    const list = await (await request.get('/api/v1/parking-lots', { headers })).json();
    const lot = list.find((l) => l.id === lotId);
    expect(lot).toBeTruthy();
    expect(lot.occupied).toBe(0);
    expect(lot.available).toBe(25);
  });

  test('PUT sửa sức chứa bãi xe', async ({ request }) => {
    const res = await request.put(`/api/v1/parking-lots/${lotId}`, {
      headers,
      data: { capacity: 40 },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).capacity).toBe(40);
  });

  test('overview bãi xe trả về lot + sessions + snapshots', async ({ request }) => {
    const res = await request.get(`/api/v1/parking-lots/${lotId}/overview`, { headers });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.lot.id).toBe(lotId);
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(Array.isArray(body.snapshots)).toBe(true);
  });

  test('sửa bãi xe không tồn tại -> 404', async ({ request }) => {
    const res = await request.put('/api/v1/parking-lots/999999999', {
      headers,
      data: { capacity: 10 },
    });
    expect(res.status()).toBe(404);
  });

  test('xóa bãi xe không tồn tại -> 404', async ({ request }) => {
    const res = await request.delete('/api/v1/parking-lots/999999999', { headers });
    expect(res.status()).toBe(404);
  });

  test('xóa bãi xe -> 200, list không còn nữa', async ({ request }) => {
    const res = await request.delete(`/api/v1/parking-lots/${lotId}`, { headers });
    expect(res.status()).toBe(200);
    const list = await (await request.get('/api/v1/parking-lots', { headers })).json();
    expect(list.some((l) => l.id === lotId)).toBe(false);
    lotId = null;
  });
});
