const { test, expect } = require('@playwright/test');

test.describe('Health check', () => {
  test('GET /health trả về status ok (không cần token)', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
