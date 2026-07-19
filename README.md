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

## 4) Chạy hệ thống web

### 4.1 Chạy qua backend (khuyến nghị, không cần chạy frontend riêng)

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

### 4.2 Chạy frontend standalone (phục vụ dev giao diện)

Frontend là static files trong `frontend/renderer` và script start hiện tại dùng Python HTTP server.

1) Chạy backend API (terminal 1):

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
```

2) Chạy frontend standalone (terminal 2):

```bash
cd frontend
npm start
```

Hoặc chạy trực tiếp không qua npm:

```bash
python3 -m http.server 5173 --directory renderer
```

3) Mở frontend:
- `http://127.0.0.1:5173`

Lưu ý:
- `frontend/renderer/config.js` đang cấu hình `API_BASE = 'http://127.0.0.1:8010'`.
- Nếu backend chạy port/host khác, cần sửa lại `API_BASE` cho đúng.

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

## 8) Kiến trúc stream camera (WebRTC + JPEG hybrid)

Hệ thống dùng **2 đường stream song song**, tự chọn theo loại nguồn camera để đạt độ trễ
thấp nhất mà vẫn hỗ trợ mọi loại camera:

| Loại nguồn | Đường hiển thị | Lý do |
|---|---|---|
| `rtsp://` (camera IP thật, vd Hikvision) | **WebRTC** (qua MediaMTX) | Trễ thấp nhất, không re-encode, không delay tích luỹ |
| `http://` MJPEG (vd app IP Webcam) | **JPEG-over-WebSocket** | MediaMTX không ingest được MJPEG → không đi WebRTC được |

Frontend hỏi backend `GET /api/v1/cameras/{id}/webrtc` để biết camera có xem được qua
WebRTC không (`available: true` chỉ khi bật tính năng + nguồn là `rtsp://` + camera đang bật),
rồi tự chọn đường phù hợp. Camera `rtsp://` chạy **thuần WebRTC** (lỗi thì tự thử lại WebRTC,
KHÔNG rơi về JPEG); camera HTTP/MJPEG dùng JPEG.

### 8.1 Sơ đồ tổng thể

```text
 Camera Hikvision (RTSP/H.264) ─┐
                                │      ┌──────────── Docker Compose network ───────────┐
                                └─────►│  MediaMTX (media server)                       │
                                       │   • ingest RTSP → repackage (KHÔNG re-encode)   │
                                       │   • WHEP/WebRTC out  :8889 (signaling)          │
                                       │   • ICE/UDP media    :8189                      │
                                       │   • RTSP re-publish  :8554 (nội bộ)             │
                                       │   • Control API      :9997 (chỉ backend gọi)    │
                                       │   • authMethod: http ──► backend xác thực JWT   │
                                       └──┬────────────────┬───────────────┬────────────┘
                            WebRTC(H.264) │   RTSP re-pub  │  Control API   │ auth check
                                          ▼                ▼                ▼
                                    Browser <video>   AI worker        backend (thêm/xoá path,
                                    (WHEP client)     (nhận diện)       xác thực read/publish)

 Camera HTTP/MJPEG ──────────► backend CameraWorker (OpenCV) ──JPEG/WS──► Browser <canvas>
```

### 8.2 Thành phần

**Backend**
- `services/mediamtx.py` — client Control API (stdlib urllib, không thêm dependency). Backend
  là bên DUY NHẤT quản lý path: mỗi camera `rtsp://` ↔ 1 path `cam<id>`, `sourceOnDemand=yes`
  (MediaMTX chỉ nối camera khi có người xem → camera chịu đúng 1 kết nối). Tự add/replace/xoá
  path khi camera bật/tắt/sửa/xoá.
- `modules/streaming/controller.py` — `POST /api/v1/streaming/mediamtx-auth`: MediaMTX gọi
  server-to-server trước mỗi hành động; backend cho phép nếu token trong query là JWT hợp lệ
  (browser) hoặc token nội bộ (AI/re-publish). `GET /api/v1/cameras/{id}/webrtc`: FE dò WebRTC.
- `services/camera_stream.py` — `CameraWorker` cho đường JPEG + AI. Đọc frame từ RTSP re-publish
  của MediaMTX (không nối thẳng camera) cho nguồn `rtsp://`, hoặc nối thẳng cho HTTP/MJPEG.
- `modules/cameras/controller.py` — `WS /ws/cameras/{id}`: đẩy JPEG (chỉ dùng cho HTTP/MJPEG
  và test AI live), gửi khi `seq > last_seq_sent` (không gửi lại frame cũ).

**Frontend**
- `js/webrtc.js` — WHEP client (non-trickle): tạo RTCPeerConnection nhận-only, POST SDP offer
  tới MediaMTX, nhận answer. Media H.264 đi thẳng browser ↔ MediaMTX (không qua backend).
- `js/stream.js` — điều phối: gọi `/webrtc` để chọn WebRTC hay JPEG, quản lý retry, phát mode
  qua `onMode` cho UI vẽ chip trạng thái.
- `js/camera.js`, `js/views/parking.js` — dùng `createStreamSession` cho grid/phóng lớn/chi tiết bãi.

### 8.3 Chống delay tích luỹ (nguyên tắc "latest-wins")

Không tầng nào dùng hàng đợi FIFO có thể phình. Mỗi tầng chỉ giữ **frame mới nhất**:
- WebRTC: không có FIFO; browser đặt `playoutDelayHint=0` / `jitterBufferTarget=0` để buffer
  tối thiểu; nhận video-only (bỏ audio để không đồng bộ A/V gây trễ).
- JPEG: capture→encode→WS→browser đều latest-wins theo số thứ tự `seq`; browser `pendingFrame`
  ghi đè (không `.push()`); + reconnect định kỳ 30' xả buffer OpenCV.
- AI: queue `maxsize=1` drain-refill (luôn bỏ frame cũ, không backlog).

### 8.4 On-demand (tiết kiệm CPU/NUC, nhẹ khi nhiều cam)

- Backend `CameraWorker` **chỉ chạy capture/encode khi có người xem JPEG hoặc bật AI**; camera
  hiển thị thuần WebRTC không kích backend (viewer WebRTC không mở JPEG-WS). Bỏ infer thread khi
  AI tắt.
- MediaMTX `sourceOnDemand`: chỉ kết nối camera khi có reader, tự ngắt khi hết.
- Frontend: `IntersectionObserver` chỉ stream card **đang hiển thị** trong viewport → browser
  decode & MediaMTX kéo chỉ theo số camera đang thấy, không theo tổng số.
- MediaMTX kéo mỗi nguồn **1 lần** rồi fan-out cho N viewer → thêm người xem không tăng tải camera.

### 8.5 Chip trạng thái luồng (UI)

Mỗi khung camera hiện chip trên header: 🔵 Đang kết nối… → 🟢 WebRTC / 🟡 JPEG / 🔴 Mất kết nối.

### 8.6 Biến môi trường liên quan (xem `.env`)

```env
STREAM_WEBRTC_ENABLED=true                 # bật đường WebRTC (tắt -> chỉ JPEG như cũ)
MEDIAMTX_API_URL=http://mediamtx:9997      # Control API (chỉ backend, KHÔNG map ra host)
MEDIAMTX_RTSP_BASE=rtsp://mediamtx:8554    # RTSP re-publish nội bộ cho AI/fallback
MEDIAMTX_WEBRTC_PUBLIC_BASE=               # để trống: FE tự suy host:8889; set khi có reverse-proxy
MEDIAMTX_WEBRTC_HOST=192.168.1.7,127.0.0.1 # IP LAN thật để ICE tới được (nhiều IP: phân tách dấu phẩy)
STREAM_INTERNAL_TOKEN=<đổi ở production>    # token nội bộ cho AI/re-publish đọc RTSP qua auth
```

Cổng expose: backend `8010`, frontend `5173`, MediaMTX WebRTC `8889` + UDP `8189`. Control API
`9997` và RTSP `8554` **chỉ nội bộ docker network** (không map ra host). Cấu hình MediaMTX ở
`mediamtx.yml`; service khai trong `docker-compose.yml`.

### 8.7 Lưu ý vận hành

- Camera Hikvision nên đặt **Profile = Low (Baseline, không B-frame)**, GOP ngắn, Smoothing 0-1,
  CBR để giảm trễ ở tầng encode.
- WebRTC qua LAN/máy khác cần `MEDIAMTX_WEBRTC_HOST` = IP LAN thật của máy chạy Docker (tránh IP
  ảo dải `172.x` của WSL/Hyper-V). Máy nhiều IP thì liệt kê nhiều, phân tách dấu phẩy.
- Nếu WebRTC không kết nối được (UDP bị chặn...), camera `rtsp://` sẽ hiện 🔴 và tự thử lại WebRTC
  (không tự rơi về JPEG — đây là chủ đích để giữ đường trễ-thấp duy nhất cho RTSP).
