const { test, expect } = require('@playwright/test');
const { login, authHeaders } = require('../utils/backend-client');
const { uniqueName } = require('../utils/test-data');

test.describe('Cameras API (/api/v1/cameras)', () => {
  let headers;
  let createdId;

  test.beforeAll(async ({ request }) => {
    headers = authHeaders(await login(request));
  });

  test.afterAll(async ({ request }) => {
    if (createdId) {
      await request.delete(`/api/v1/cameras/${createdId}`, { headers });
    }
  });

  test('tạo camera hợp lệ -> 200, có id + stream_ws_path đúng', async ({ request }) => {
    const name = uniqueName('E2E_Cam');
    const res = await request.post('/api/v1/cameras', {
      headers,
      data: { name, source_url: 'rtsp://example.invalid/stream', enabled: false },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.name).toBe(name);
    expect(body.enabled).toBe(false);
    expect(body.stream_ws_path).toBe(`/ws/cameras/${body.id}`);
    createdId = body.id;
  });

  test('tạo camera source_url sai định dạng (không rtsp/http/https) -> 400', async ({ request }) => {
    const res = await request.post('/api/v1/cameras', {
      headers,
      data: { name: uniqueName('Bad_Cam'), source_url: 'ftp://not-allowed.example' },
    });
    expect(res.status()).toBe(400);
  });

  test('danh sách camera chứa camera vừa tạo', async ({ request }) => {
    const res = await request.get('/api/v1/cameras', { headers });
    expect(res.status()).toBe(200);
    const list = await res.json();
    expect(list.some((c) => c.id === createdId)).toBe(true);
  });

  test('PUT sửa tên/url/enabled của camera', async ({ request }) => {
    const newName = uniqueName('E2E_Cam_Renamed');
    const res = await request.put(`/api/v1/cameras/${createdId}`, {
      headers,
      data: { name: newName, source_url: 'rtsp://example.invalid/stream2', enabled: true },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.name).toBe(newName);
    expect(body.source_url).toBe('rtsp://example.invalid/stream2');
    expect(body.enabled).toBe(true);
  });

  test('PATCH chỉ toggle enabled', async ({ request }) => {
    const res = await request.patch(`/api/v1/cameras/${createdId}`, {
      headers,
      data: { enabled: false },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).enabled).toBe(false);
  });

  test('sửa camera không tồn tại -> 404', async ({ request }) => {
    const res = await request.put('/api/v1/cameras/999999999', {
      headers,
      data: { name: 'x', source_url: 'rtsp://example.invalid/x' },
    });
    expect(res.status()).toBe(404);
  });

  test('xóa camera không tồn tại -> 404', async ({ request }) => {
    const res = await request.delete('/api/v1/cameras/999999999', { headers });
    expect(res.status()).toBe(404);
  });

  test('xóa camera vừa tạo -> 200, list không còn nữa', async ({ request }) => {
    const res = await request.delete(`/api/v1/cameras/${createdId}`, { headers });
    expect(res.status()).toBe(200);

    const list = await (await request.get('/api/v1/cameras', { headers })).json();
    expect(list.some((c) => c.id === createdId)).toBe(false);
    createdId = null; // đã xóa - afterAll không cần dọn lại
  });
});
