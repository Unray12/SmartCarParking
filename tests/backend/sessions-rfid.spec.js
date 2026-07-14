const { test, expect } = require('@playwright/test');
const { login, authHeaders } = require('../utils/backend-client');
const { uniqueName } = require('../utils/test-data');

// Luồng nghiệp vụ TRUNG TÂM của toàn hệ thống (xem CONTEXT.md §0.1, §8):
// quẹt RFID in/out ghép với biển số -> tạo/đóng ParkingSession + tính phí.
test.describe('RFID check-in/check-out -> ParkingSession', () => {
  let headers;
  let lotId;
  const cardId = uniqueName('CARD').toUpperCase();
  const plate = `E2E${Date.now().toString().slice(-6)}`;

  test.beforeAll(async ({ request }) => {
    headers = authHeaders(await login(request));
    const lotRes = await request.post('/api/v1/parking-lots', {
      headers,
      data: { name: uniqueName('E2E_RFID_Lot'), capacity: 10 },
    });
    lotId = (await lotRes.json()).id;
  });

  test.afterAll(async ({ request }) => {
    // Bãi này đã có lịch sử phiên gửi xe (parking_sessions.lot_id tham chiếu tới) ->
    // backend từ chối xóa cứng (409, xem test "xóa bãi xe có lịch sử..." bên dưới).
    // Dọn dẹp hợp lý là vô hiệu hóa (is_active=false) thay vì xóa.
    if (lotId) await request.put(`/api/v1/parking-lots/${lotId}`, { headers, data: { is_active: false } });
  });

  test('check-in với biển số -> tạo session status=in', async ({ request }) => {
    const res = await request.post('/api/v1/rfid-events', {
      headers,
      data: { card_id: cardId, direction: 'in', plate, source: 'playwright-test', lot_id: lotId },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('checked_in');
    expect(body.plate).toBe(plate);
    expect(body.card_id).toBe(cardId);

    const sessions = await (await request.get('/api/v1/sessions?active_only=true&limit=200', { headers })).json();
    expect(sessions.some((s) => s.plate === plate && s.status === 'in')).toBe(true);
  });

  test('check-in lần 2 cùng thẻ khi đang trong bãi -> already_in (không tạo session mới)', async ({ request }) => {
    const res = await request.post('/api/v1/rfid-events', {
      headers,
      data: { card_id: cardId, direction: 'in', plate, source: 'playwright-test', lot_id: lotId },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe('already_in');
  });

  test('check-out đúng biển số -> đóng session, trả fee/duration_minutes', async ({ request }) => {
    const res = await request.post('/api/v1/rfid-events', {
      headers,
      data: { card_id: cardId, direction: 'out', plate, source: 'playwright-test', lot_id: lotId },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('checked_out');
    expect(body.fee).not.toBeNull();
    expect(body.duration_minutes).not.toBeNull();

    const sessions = await (await request.get('/api/v1/sessions?limit=200', { headers })).json();
    const closed = sessions.find((s) => s.plate === plate && s.status === 'out');
    expect(closed).toBeTruthy();
    expect(closed.fee).toBeGreaterThanOrEqual(0);
  });

  test('check-out thẻ không có session mở -> not_found', async ({ request }) => {
    const res = await request.post('/api/v1/rfid-events', {
      headers,
      data: { card_id: cardId, direction: 'out', plate, source: 'playwright-test', lot_id: lotId },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe('not_found');
  });

  test('check-out biển số không khớp -> plate_mismatch, session KHÔNG bị đóng', async ({ request }) => {
    const card2 = uniqueName('CARD2').toUpperCase();

    const inRes = await request.post('/api/v1/rfid-events', {
      headers,
      data: { card_id: card2, direction: 'in', plate: 'AAA111', source: 'playwright-test', lot_id: lotId },
    });
    expect((await inRes.json()).status).toBe('checked_in');

    const outRes = await request.post('/api/v1/rfid-events', {
      headers,
      data: { card_id: card2, direction: 'out', plate: 'BBB222', source: 'playwright-test', lot_id: lotId },
    });
    const outBody = await outRes.json();
    expect(outBody.status).toBe('plate_mismatch');
    expect(outBody.mismatch).toBe(true);

    const stillOpen = await (await request.get('/api/v1/sessions?active_only=true&limit=200', { headers })).json();
    expect(stillOpen.some((s) => s.rfid_card === card2 && s.status === 'in')).toBe(true);

    // Dọn dẹp: check-out đúng biển số để đóng session, tránh rò rỉ session mở
    // ảnh hưởng dashboard/occupancy của các lần chạy test sau.
    const cleanup = await request.post('/api/v1/rfid-events', {
      headers,
      data: { card_id: card2, direction: 'out', plate: 'AAA111', source: 'playwright-test', lot_id: lotId },
    });
    expect((await cleanup.json()).status).toBe('checked_out');
  });

  test('check-in không có biển số -> vẫn tạo session (plate=null)', async ({ request }) => {
    const card3 = uniqueName('CARD3').toUpperCase();
    const res = await request.post('/api/v1/rfid-events', {
      headers,
      data: { card_id: card3, direction: 'in', source: 'playwright-test', lot_id: lotId },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('checked_in');
    expect(body.plate).toBeNull(); // sentinel __NONE__ được map về null cho client

    await request.post('/api/v1/rfid-events', {
      headers,
      data: { card_id: card3, direction: 'out', source: 'playwright-test', lot_id: lotId },
    });
  });

  test('xóa bãi xe đã có lịch sử phiên gửi xe -> 409 (không mất lịch sử), KHÔNG phải 500', async ({ request }) => {
    // lotId ở đây đã có nhiều parking_sessions tham chiếu tới (các test phía trên)
    // -> Postgres từ chối xóa do foreign key. Backend phải bắt lỗi này và trả 409
    // rõ ràng, không để lộ ra 500 (unhandled IntegrityError).
    const res = await request.delete(`/api/v1/parking-lots/${lotId}`, { headers });
    expect(res.status()).toBe(409);

    const stillThere = await (await request.get('/api/v1/parking-lots', { headers })).json();
    expect(stillThere.some((l) => l.id === lotId)).toBe(true);
  });
});

test.describe('RFID cards CRUD (/api/v1/rfid/cards)', () => {
  let headers;
  const cardId = uniqueName('RFIDCARD').toUpperCase();

  test.beforeAll(async ({ request }) => {
    headers = authHeaders(await login(request));
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/v1/rfid/cards/${cardId}`, { headers });
  });

  test('tạo thẻ RFID mới', async ({ request }) => {
    const res = await request.post('/api/v1/rfid/cards', {
      headers,
      data: { card_id: cardId, plate: 'E2E999', owner_name: 'Playwright Tester' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.card_id).toBe(cardId);
    expect(body.is_active).toBe(true);
  });

  test('tạo lại thẻ trùng card_id -> 400', async ({ request }) => {
    const res = await request.post('/api/v1/rfid/cards', {
      headers,
      data: { card_id: cardId, plate: 'X' },
    });
    expect(res.status()).toBe(400);
  });

  test('danh sách thẻ chứa thẻ vừa tạo', async ({ request }) => {
    const list = await (await request.get('/api/v1/rfid/cards', { headers })).json();
    expect(list.some((c) => c.card_id === cardId)).toBe(true);
  });

  test('sửa thẻ (đổi biển số + khóa thẻ)', async ({ request }) => {
    const res = await request.put(`/api/v1/rfid/cards/${cardId}`, {
      headers,
      data: { plate: 'E2E888', is_active: false },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.plate).toBe('E2E888');
    expect(body.is_active).toBe(false);
  });

  test('sửa thẻ không tồn tại -> 404', async ({ request }) => {
    const res = await request.put('/api/v1/rfid/cards/NO_SUCH_CARD_XYZ', {
      headers,
      data: { plate: 'X' },
    });
    expect(res.status()).toBe(404);
  });

  test('xóa thẻ không tồn tại -> 404', async ({ request }) => {
    const res = await request.delete('/api/v1/rfid/cards/NO_SUCH_CARD_XYZ', { headers });
    expect(res.status()).toBe(404);
  });
});
