const { test, expect } = require('@playwright/test');
const { login, authHeaders } = require('../utils/backend-client');

test.describe('Plates / Logs / AI status API', () => {
  let headers;

  test.beforeAll(async ({ request }) => {
    headers = authHeaders(await login(request));
  });

  test('GET /plates trả về danh sách (có thể rỗng)', async ({ request }) => {
    const res = await request.get('/api/v1/plates?limit=20', { headers });
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('GET /logs trả về danh sách log tổng hợp (RFID + plate + session)', async ({ request }) => {
    const res = await request.get('/api/v1/logs?hours=24&limit=50', { headers });
    expect(res.status()).toBe(200);
    const logs = await res.json();
    expect(Array.isArray(logs)).toBe(true);
    // Log gần nhất (nếu có) phải là những sự kiện vừa được các spec khác tạo ra.
    if (logs.length) {
      expect(logs[0]).toHaveProperty('type');
      expect(logs[0]).toHaveProperty('timestamp');
    }
  });

  test('GET /ai/status trả về recognizer_name + models_dir + uploaded_models', async ({ request }) => {
    const res = await request.get('/api/v1/ai/status', { headers });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.recognizer_name).toBe('string');
    expect(typeof body.models_dir).toBe('string');
    expect(Array.isArray(body.uploaded_models)).toBe(true);
  });

  test('AI test-camera với camera_id không tồn tại -> 200 nhưng frame_available=false', async ({ request }) => {
    // Không có worker cho camera_id lạ -> get_latest_frame rỗng -> vẫn 200,
    // chỉ báo frame_available=false + detections=[] (không raise lỗi).
    const res = await request.post('/api/v1/ai/test-camera', {
      headers,
      data: { camera_id: 999999999 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.frame_available).toBe(false);
    expect(body.detections).toEqual([]);
  });

  test('không token -> 401 cho plates/logs/ai', async ({ request }) => {
    for (const path of ['/api/v1/plates', '/api/v1/logs', '/api/v1/ai/status']) {
      const res = await request.get(path);
      expect(res.status(), `${path} phải 401`).toBe(401);
    }
  });
});
