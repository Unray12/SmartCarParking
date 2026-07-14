# SmartCarParking — Test suite (Playwright)

Bộ test **Playwright** cho cả 2 phần:
- `tests/backend/*.spec.js` — test API thật (không mock) qua `request` fixture của Playwright, đấu thẳng vào backend FastAPI + Postgres.
- `tests/frontend/*.spec.js` — test E2E qua browser thật (Chromium), lái UI (login, sidebar, form, bảng, dialog xác nhận...).

## Chuẩn bị

Cần **backend + frontend đang chạy** (Docker hoặc chạy tay đều được) trước khi test:

```bash
# Cách 1: Docker (từ repo root)
docker compose up -d db backend frontend

# Cách 2: chạy tay (2 terminal, từ repo root)
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8010
cd frontend && npm start   # http.server 5173
```

Cài dependency test (1 lần):

```bash
cd tests
npm install
npx playwright install chromium
```

## Chạy test

```bash
npm test                 # chạy cả backend + frontend
npm run test:backend     # chỉ API
npm run test:frontend    # chỉ UI (Chromium headless)
npm run test:headed      # UI có mở browser thấy trực tiếp
npm run report           # xem báo cáo HTML sau khi chạy
```

Đổi URL nếu backend/frontend không chạy port mặc định:

```bash
BACKEND_URL=http://192.168.1.50:8010 FRONTEND_URL=http://192.168.1.50:5173 npm test
```

## Vì sao chạy tuần tự (`workers: 1`)?

Suite này test thẳng vào **1 backend + 1 Postgres thật**, không mock, không tạo
DB riêng cho mỗi test. Nhiều test đổi cùng loại dữ liệu (đổi mật khẩu admin,
tạo/xóa camera, bãi xe, thẻ RFID...) — chạy song song sẽ đụng dữ liệu nhau và
cho kết quả không ổn định (flaky). `playwright.config.js` đặt `workers: 1` để
chạy tuần tự, đánh đổi tốc độ lấy sự ổn định — phù hợp quy mô suite hiện tại.

Mỗi test tự dọn dữ liệu nó tạo ra (xóa camera/bãi xe/thẻ RFID trong
`afterAll`/cuối test, đóng lại session RFID đã mở, khôi phục mật khẩu admin
trong `finally`) để không rò rỉ dữ liệu ảnh hưởng lần chạy sau.

**Lưu ý:** backend spec (`tests/backend/*`) chạy ổn định 100% mọi lần. Frontend
spec đôi khi (hiếm) có 1-2 test bị flake nếu máy đang tải nặng (chạy song song
nhiều container/agent khác) khiến 1 lượt click sidebar bị "trượt" -
`utils/ui-helpers.js:gotoView()` đã tự retry click 3 lần để giảm hẳn tình
trạng này. Nếu vẫn thấy fail, thử chạy lại riêng file đó
(`npx playwright test frontend/<file>.spec.js`) để phân biệt bug thật hay chỉ
là môi trường đang bận.

## Cấu trúc

```
tests/
├── playwright.config.js   # 2 project: backend (API) / frontend (UI, có storageState đăng nhập sẵn)
├── global-setup.js        # login 1 lần qua UI, lưu storageState cho các test frontend cần đã đăng nhập
├── utils/
│   ├── backend-client.js  # helper login + tạo Authorization header cho test backend
│   └── test-data.js       # sinh tên duy nhất (uniqueName) + danh sách VIEWS (đối chiếu state.js)
├── backend/
│   ├── health.spec.js
│   ├── auth.spec.js               # login/me/change-password/reset-password + bảo vệ JWT
│   ├── cameras.spec.js            # CRUD camera + validate source_url
│   ├── parking-lots.spec.js       # CRUD bãi xe + overview
│   ├── sessions-rfid.spec.js      # luồng RFID in/out -> ParkingSession (nghiệp vụ chính) + CRUD thẻ RFID
│   ├── dashboard.spec.js          # summary + stats
│   └── plates-logs-ai.spec.js     # plates, logs, ai/status, ai/test-camera
└── frontend/
    ├── login.spec.js       # token-gate, sai mật khẩu, đăng nhập đúng, modal reset
    ├── navigation.spec.js  # chuyển đủ mọi tab sidebar, thu/mở sidebar
    ├── cameras-ui.spec.js  # thêm/sửa/toggle/xóa camera qua UI thật (kể cả dialog confirm)
    ├── parking-lots-ui.spec.js  # thêm/sửa/hủy-sửa/xem chi tiết/xóa bãi xe qua UI
    ├── rfid-ui.spec.js     # thêm/xóa thẻ RFID + gửi sự kiện test in/out qua form
    └── responsive.spec.js # scale UI theo màn hình máy tính (root font-size, layout sidebar/content)
```

Không mock API ở test frontend (không dùng `page.route()` để giả response) —
UI test chạy xuyên suốt xuống backend + DB thật, đúng nghĩa end-to-end.
