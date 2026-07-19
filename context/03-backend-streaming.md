# 03 — Backend streaming

## File
| File | Trách nhiệm |
|---|---|
| `services/camera_stream.py` | `CameraWorker` (đa luồng) + `CameraStreamManager` (đồng bộ worker & MediaMTX path) |
| `services/mediamtx.py` | `MediaMTXClient` — Control API (stdlib urllib, không thêm dependency) |
| `modules/streaming/controller.py` | `POST /streaming/mediamtx-auth` (public, MediaMTX gọi) |
| `modules/cameras/controller.py` | `GET /cameras/{id}/webrtc` (FE dò WebRTC) + `WS /ws/cameras/{id}` (JPEG) |

## MediaMTXClient (`mediamtx.py`)
- `path_name(id) = "cam{id}"`.
- `upsert_camera_path(id, rtsp_url)`: `POST /v3/config/paths/add/{name}` (source=rtsp, `sourceOnDemand=yes`, `rtspTransport=tcp`). Nếu path đã tồn tại (400) → fallback `POST /v3/config/paths/replace/{name}`.
  > ⚠️ Bug đã sửa (2026-07-19): trước dùng `PATCH` cho replace → sai method, source không cập nhật khi backend restart mà MediaMTX còn giữ path cũ. Đúng là **POST**.
- `remove_camera_path(id)`: `DELETE .../delete/{name}` (idempotent, 404/400 coi như đã sạch).
- Lỗi kết nối MediaMTX được nuốt (log + return) → không làm sập luồng camera.

## CameraWorker (`camera_stream.py`)
- Nguồn capture: rtsp + WebRTC bật → đọc từ **RTSP re-publish của MediaMTX** (`rtsp://mediamtx:8554/cam{id}?token=<internal>`) để camera chỉ chịu 1 kết nối; ngược lại nối thẳng nguồn.
- Luồng: `_capture_loop` (giải mã, latest-wins vào `_latest_frame_bgr`), `_encode_loop` (JPEG khi có viewer), `_infer_loop` (AI).
- **On-demand** (tiết kiệm CPU, nhẹ khi nhiều cam):
  - `_wants_capture()` = `enable_inference OR viewers>0`; `_wants_encode()` = `viewers>0`.
  - Không nhu cầu → nhả `cap` (MediaMTX onDemand tự ngắt camera), dọn frame cũ, idle.
  - **Infer thread chỉ start khi `enable_inference`** (AI tắt → 2 thread/cam thay vì 3).
  - `add_viewer()/remove_viewer()`: WS controller gọi khi client JPEG kết nối/ngắt.
- `capture_skip_grabs` chỉ áp cho nguồn `rtsp://` thật (HTTP/MJPEG bỏ qua, tránh mất frame).

## CameraStreamManager
- `_start_camera`: đăng ký MediaMTX path (nếu rtsp) **trước** khi worker mở capture, rồi start worker.
- `_stop_camera`: stop worker + xoá path (idempotent).
- `add_stream_viewer/remove_stream_viewer` → worker (đánh thức/ngủ on-demand).
- `test_camera_ai` + RFID snapshot: **bump viewer tạm thời** để đánh thức capture lấy 1 frame (thay vì cold-open RTSP trực tiếp), luôn `remove_viewer` ở `finally`.

## Xác thực (`streaming/controller.py`)
`mediamtx-auth`: parse `token` từ `query`; hợp lệ nếu = `STREAM_INTERNAL_TOKEN` hoặc JWT có `sub`.
- `read/playback` → cần token hợp lệ (204/401).
- `publish` → 401. `api/metrics/pprof` → 204 (cổng 9997 nội bộ). Body hỏng → 401 (không crash).

## Đã verify (Docker, 2026-07-19)
- `mediamtx-auth`: read+JWT=204, read+bad=401, publish=401, api=204, malformed=401.
- WS JPEG on-demand: nguồn MJPEG → nhận frame `ffd8ff` hợp lệ (capture→encode→WS chạy).
- MediaMTX path add/replace/delete đúng; webrtc-info http=false / rtsp=true.
- Camera không kết nối được → 200 `frame_available:false`, backend vẫn sống, retry, 0 traceback.
