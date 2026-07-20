# Code Map — nhảy vào file nào khi troubleshoot / code thêm

> Mục đích: tra nhanh **file nào chịu trách nhiệm gì** để biết mở file nào khi sửa lỗi hoặc
> thêm tính năng. Logic nghiệp vụ sâu xem [overview.md](overview.md) / [rfid.md](rfid.md) /
> [backend.md](backend.md); chi tiết stream xem [streaming-architecture.md](streaming-architecture.md).

## 1. Tra nhanh theo triệu chứng / nhu cầu

| Tôi muốn… / Lỗi… | Mở file |
|---|---|
| Camera live bị lỗi/đen/trễ (WebRTC) | FE `js/webrtc.js`, `js/stream.js`; BE `services/mediamtx.py`, `modules/streaming/controller.py` |
| Camera HTTP/MJPEG không lên hình | FE `js/jpeg-stream.js`; BE `services/camera_stream.py` (`_capture_loop`), `modules/cameras/controller.py` (WS) |
| Chip trạng thái luồng (WebRTC/JPEG) | FE `js/ui.js` (`setStreamStatusChip`), `js/stream.js` (`onMode`) |
| Thêm/sửa/xoá camera, validate URL | BE `modules/cameras/` (controller/service); FE `js/camera.js`, `js/main.js` (form thêm) |
| CRUD bãi xe, chi tiết bãi, snapshot | BE `modules/parking_lots/`; FE `js/views/parking.js` |
| RFID quẹt thẻ, check-in/out, ghép biển | BE `modules/rfid/service.py` (**lõi nghiệp vụ**), `services/rfid_usb_reader.py`, `main.py` (`_handle_rfid_from_usb`) |
| Nhận diện biển số (AI/ANPR) | BE `services/*_plate_recognizer.py`, `services/camera_stream.py` (`_infer_loop`), `modules/ai/` |
| Phí gửi xe / thời gian phiên | BE `modules/sessions/service.py`; cấu hình `core/config.py` (`parking_fee_*`) |
| Đăng nhập / JWT / đổi mật khẩu | BE `modules/auth/` (security/dependencies/service); FE `js/api.js`, `js/account.js`, `login.js` |
| API trả 401 / bảo vệ endpoint | BE `modules/router.py` (gắn `get_current_user`), `modules/auth/dependencies.py` |
| Giữ phiên (refresh giữ trang) | FE `js/state.js` (`loadNav/saveNav`), `js/main.js` (`switchView`/`getInitialView`/`hashchange`) |
| Điều hướng tab / polling làm mới | FE `js/main.js` |
| Số liệu dashboard / báo cáo | BE `modules/dashboard/`; FE `js/views/overview.js`, `reports.js` |
| Log tổng hợp | BE `modules/logs/`; FE `js/logs.js`, `js/views/history.js` |
| Thêm biến cấu hình (.env) | BE `core/config.py` + `.env`/`.env.example` (+ `../.env` khi chạy Docker) |
| DB thiếu cột / migrate | BE `database/session.py` (`_ensure_runtime_schema`) |
| Cấu hình Docker / MediaMTX / cổng | `docker-compose.yml`, `mediamtx.yml`, `backend/Dockerfile`, `frontend/Dockerfile` |

## 2. Backend (`backend/app/`)

**Khởi động & hạ tầng**
| File | Vai trò | Khi nào đụng |
|---|---|---|
| `main.py` | Lifespan (init_db, seed admin, load recognizer, tạo `CameraStreamManager`, start RFID USB), middleware, serve web, callback RFID USB. Giữ global `_CAMERA_MANAGER` | Đổi thứ tự khởi động, middleware, phục vụ static |
| `dependencies.py` | `get_camera_manager` (lấy từ `app.state`) | Inject camera manager vào controller |
| `core/config.py` | `Settings` (pydantic) — **mọi biến .env** | Thêm/đổi config |
| `database/session.py` | engine, `SessionLocal`, `init_db`, `_ensure_runtime_schema` (migrate nhẹ, KHÔNG Alembic) | Thêm bảng/cột mới |
| `database/base.py` | `DeclarativeBase`, `utcnow()` | Ít khi |
| `modules/router.py` | Gom router con dưới `/api/v1`, gắn JWT tập trung; WS router ngoài version | Thêm module API mới, đổi bảo vệ |
| `modules/models.py` | Import mọi model để đăng ký metadata | Thêm model mới |

**Module nghiệp vụ (mỗi module: `model.py` / `schema.py` / `service.py` / `controller.py`)**
| Module | Chịu trách nhiệm |
|---|---|
| `auth/` | JWT (`security.py`), `get_current_user` (`dependencies.py`), login/me/đổi-đặt mật khẩu, `AdminUser` |
| `cameras/` | CRUD camera, `validate_camera_source`, `GET /{id}/webrtc`, **`WS /ws/cameras/{id}`** (JPEG) |
| `streaming/` | `POST /streaming/mediamtx-auth` — MediaMTX gọi để xác thực read/publish (public) |
| `parking_lots/` | Bãi xe, occupancy, snapshot, overview, serve file ảnh |
| `rfid/` | Sự kiện + thẻ RFID + **logic check-in/out, ghép RFID↔biển** (`service.py` là lõi) |
| `sessions/` | Phiên gửi xe, tính/chốt phí & thời gian |
| `plates/` | Lịch sử đọc biển số |
| `dashboard/` | KPI tổng quan + `stats` (theo ngày/giờ) |
| `ai/` | Upload model + `POST /ai/test-camera` (nhận diện on-demand) |
| `logs/` | Gom log từ nhiều bảng thành `LogEntry` |

**Services (trái tim runtime)**
| File | Vai trò |
|---|---|
| `services/camera_stream.py` | `CameraStreamManager` (đồng bộ worker↔DB↔MediaMTX path) + `CameraWorker` (3 luồng capture/encode/infer, **on-demand**, latest-wins). Xem streaming-architecture.md |
| `services/mediamtx.py` | `MediaMTXClient` — Control API: `upsert_camera_path` (add, fallback **POST** replace), `remove_camera_path`, `path_name` |
| `services/plate_recognizer.py` | Interface + `load_plate_recognizer` + `normalize_plate` + Dummy |
| `services/yolo_onnx_plate_recognizer.py` / `paddle_plate_recognizer.py` | Triển khai ANPR thật |
| `services/rfid_usb_reader.py` | Đọc serial RFID đa luồng, tự reconnect |

## 3. Frontend (`frontend/renderer/`)

**Hạ tầng chung**
| File | Vai trò | Khi nào đụng |
|---|---|---|
| `index.html` / `login.html` | App chính (sidebar + panel) / trang đăng nhập | Thêm view/element |
| `config.js` | `window.__APP_CONFIG__.API_BASE` | Đổi địa chỉ backend |
| `js/api.js` | fetch wrapper + token + `wsCameraUrl()` + `buildWhepUrl()` + 401→login | Đổi cách gọi API / URL tài nguyên |
| `js/state.js` | `appState`, `VIEW_META`, `loadStorage/saveSettings`, **`loadNav/saveNav`** (giữ phiên) | Thêm state / persistence |
| `js/dom.js` | Cache toàn bộ `getElementById` (1 nơi) | Thêm element mới → khai ở đây |
| `js/ui.js` | `notify`, toast, format, `escapeHtml`, **`setStreamStatusChip`**, **`withButtonBusy`** | Tiện ích UI dùng chung |
| `js/layout.js` | Sidebar drawer/collapse, form cài đặt | Layout/sidebar |
| `js/account.js` | Đăng nhập state, đổi/đặt lại mật khẩu, đăng xuất | Auth UI |
| `js/main.js` | **Orchestrator**: `switchView`, `getInitialView`, `hashchange`, polling, vòng đời, form thêm camera | Điều hướng, polling, ghép module |

**Stream camera (3 lớp — tách bạch trách nhiệm)**
| File | Vai trò |
|---|---|
| `js/webrtc.js` | WHEP client thuần: RTCPeerConnection nhận-only, tối ưu trễ (`playoutDelayHint=0`, video-only) |
| `js/jpeg-stream.js` | `createJpegCanvasPlayer` — JPEG-over-WS→canvas dùng chung (latest-wins, tự reconnect). Dùng bởi card/focus/lot |
| `js/stream.js` | `createStreamSession` — **điểm điều phối**: chọn WebRTC hay JPEG, retry, phát `onMode`. Thêm hành vi hiển thị mới → sửa Ở ĐÂY |

> Hợp đồng: `createStreamSession({cameraId, video, canvas, showVideo, showCanvas, startJpeg, onMode})`
> → `{start, stop}`. Consumer chỉ cấp element + callback, KHÔNG tự viết WS/decode.

**Trang (views) & module**
| File | Trang |
|---|---|
| `js/camera.js` | Card camera grid + phóng lớn; `IntersectionObserver` chỉ stream card đang thấy |
| `js/views/parking.js` | Bãi xe + chi tiết (2 stream vào/ra + snapshot) |
| `js/views/ai.js` | Upload model + test AI live (có vòng JPEG+overlay box riêng) |
| `js/views/overview.js` / `reports.js` | KPI, occupancy, chart |
| `js/views/history.js` | Sessions + Plate reads |
| `js/views/rfid.js` | Gửi event + thẻ + log |
| `js/views/system.js` | Health check |
| `js/logs.js` | Module Logs |

## 4. Luồng xuyên file (đọc để hiểu 1 tính năng đi qua đâu)

- **Xem camera (WebRTC)**: `camera.js` → `stream.js` (`/cameras/{id}/webrtc`) → `webrtc.js` (WHEP tới MediaMTX) ↔ MediaMTX ← `mediamtx.py` (path do backend đăng ký). Xác thực: MediaMTX → `streaming/controller.py`.
- **Xem camera (JPEG)**: `camera.js`/`parking.js` → `stream.js` → `jpeg-stream.js` (WS) → `cameras/controller.py` (`ws_camera_stream`) → `camera_stream.py` (`add_viewer`→capture→encode).
- **Quẹt RFID vào**: `rfid_usb_reader.py` → `main.py::_handle_rfid_from_usb` → `rfid/service.py::ingest_rfid_event` → `_handle_check_in` (ghép biển, `_capture_snapshot` qua `camera_stream.py`) → tạo `ParkingSession`.
- **Test AI**: `views/ai.js` → `ai/controller.py` → `ai/service.py` → `camera_stream.py::test_camera_ai` (bump viewer lấy frame → `recognizer.detect`).
- **Đăng nhập**: `login.js` → `auth/controller.py::login` → JWT → FE lưu token (`api.js`) → mọi request gắn Bearer, 401 → `login.html`.

## 5. Cấu hình & hạ tầng (gốc repo)
| File | Vai trò |
|---|---|
| `docker-compose.yml` | 4 service: db, **mediamtx (pin 1.19.2)**, backend, frontend; cổng, volume, env |
| `mediamtx.yml` | Cấu hình MediaMTX (authMethod http, WebRTC/RTSP, ICE) |
| `.env` (gốc) | Config khi chạy Docker (nguồn thật, đã gitignore) |
| `backend/.env` | Config khi chạy bare-metal |
| `backend/Dockerfile` / `frontend/Dockerfile` | Build image |
