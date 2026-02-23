# SmartCarParking

Web app quản lý bãi giữ xe:
- Backend: FastAPI + PostgreSQL (MVC module)
- Frontend: Web dashboard (HTML/CSS/JS) với sidebar menu nhiều chức năng

## 1) Cấu trúc backend (MVC module)

```text
backend/app/
  core/                # config từ .env
  database/            # engine/session/base
  modules/
    ai/                # upload model + test camera với AI
    cameras/           # model/schema/service/controller
    plates/            # model/schema/service/controller
    sessions/          # model/schema/service/controller
    rfid/              # model/schema/service/controller
    dashboard/         # schema/service/controller
  services/            # camera stream manager, plate recognizer
  main.py              # app lifecycle + routers + serve web UI
```

## 2) Cấu trúc frontend (module hóa)

```text
frontend/renderer/
  index.html
  styles.css
  config.js            # API base
  js/
    api.js             # gọi API chung
    state.js           # state + local storage
    camera.js          # camera card, sửa/xóa, focus/phóng lớn
    main.js            # bootstrap + logic các tab
```

## 3) Cấu hình môi trường

Thông tin nhạy cảm chỉ đặt trong `backend/.env`.

Tạo từ mẫu `backend/.env.example`:

```env
APP_NAME=Smart Parking Backend
DATABASE_URL=postgresql+psycopg2://<db_user>:<db_password>@<db_host>:<db_port>/<db_name>
ADMIN_USERNAME=<admin_username>
ADMIN_PASSWORD=<admin_password>
RFID_LINK_WINDOW_SECONDS=30
CORS_ORIGINS=*
PLATE_RECOGNIZER=

STREAM_TARGET_FPS=20
STREAM_JPEG_QUALITY=78
STREAM_MAX_WIDTH=1280
STREAM_INFER_EVERY_N_FRAMES=6
STREAM_PLATE_DEDUPE_SECONDS=8
AI_MODELS_DIR=models_store
```

## 4) Chạy hệ thống web (port backend: 8010)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
```

Mở trình duyệt:
- `http://127.0.0.1:8010` (web UI)
- `http://127.0.0.1:8010/docs` (API docs)

## 5) Menu sidebar trên UI

- `Dashboard`: camera live, toggle camera, tổng quan realtime
  - chỉ số hệ thống nằm trong Dashboard
  - sửa camera bằng form modal (không dùng prompt)
  - hỗ trợ xóa camera và phóng lớn camera được chọn
  - responsive: sidebar có thể ẩn/hiện, tối đa 4 camera trên mỗi hàng
- `History`: lịch sử phiên xe + lịch sử nhận diện biển số
- `RFID Gate`: gửi test tín hiệu RFID vào/ra
- `AI Center`: upload model, test camera với AI
- `User`: login/logout cho dashboard (xác thực qua backend)
- `Settings`: chu kỳ refresh và endpoint
- `System`: health check backend

## 6) API chính

- `GET /api/cameras`
- `POST /api/auth/login`
- `POST /api/cameras`
- `PATCH /api/cameras/{camera_id}`
- `PUT /api/cameras/{camera_id}` (sửa tên/url camera)
- `DELETE /api/cameras/{camera_id}`
- `WS /ws/cameras/{camera_id}`
- `GET /api/plates/recent`
- `GET /api/sessions`
- `GET /api/dashboard/summary`
- `POST /api/rfid/events`
- `GET /api/ai/status`
- `POST /api/ai/upload-model` (multipart form-data)
- `POST /api/ai/test-camera`

## 7) Bảo mật

`.gitignore` đã bỏ các file nhạy cảm:
- `.env`, `backend/.env`, `frontend/.env`
- `*.pem`, `*.key`, `*.crt`
- `secrets/`, `credentials/`
