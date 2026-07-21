# Tổng quan & logic cốt lõi

## 0. Logic & ngữ cảnh cốt lõi (ĐỌC TRƯỚC — để nhớ nhanh)

Những quyết định/cơ chế **không hiển nhiên** trong code, dễ quên — nắm cái này trước khi sửa:

1. **Luồng nghiệp vụ trung tâm = ghép RFID ↔ Biển số → ParkingSession.** ANPR đọc biển ghi vào `plate_reads(linked=False)`; khi quẹt RFID `in`, `_handle_check_in` lấy biển từ payload, hoặc thẻ đã đăng ký (`find_plate_by_card`), hoặc PlateRead chưa link trong cửa sổ `rfid_link_window_seconds` (mặc định 30s) rồi đánh dấu `linked=True`. Không có biển → lưu sentinel `__NONE__` (UI map về `null`). Xem [rfid.md](rfid.md).
2. **Phí được CHỐT & LƯU lúc check-out** vào `parking_sessions.fee`/`duration_minutes` (immutable) — KHÔNG tính lại từ giá hiện hành cho xe đã ra. Xe đang gửi mới tính ước lượng on-the-fly. Lý do: đổi `PARKING_FEE_*` không được làm sai hóa đơn cũ.
3. **Stream camera chỉ bật ở view `cameras`** (không phải tất cả tab) để giảm tải — `camera.js` check `state.currentView === 'cameras'`; ngoài ra `IntersectionObserver` chỉ stream card đang thấy. Parking-lot live có poll riêng. Xem [streaming-architecture.md](streaming-architecture.md).
4. **ANPR realtime (stream nền, ghi `plate_reads`) mặc định TẮT** (`STREAM_ENABLE_INFERENCE=false`) — chỉ stream + snapshot, không tự đọc biển liên tục. Đây KHÁC với AI on-demand ở mục 11 — 2 cơ chế độc lập, cùng dùng chung 1 `recognizer` instance.
5. **Auth + bảo vệ API bằng JWT:**
   - **Mọi API dưới `/api/v1`** bảo vệ bằng **JWT Bearer (PyJWT, HS256)** qua dependency `get_current_user` gắn tập trung trong `router.py`. Thiếu/sai token → **401**.
   - **Không nằm dưới `dependencies=_auth` ở router.py (nhưng KHÔNG mở hoàn toàn):** `POST /api/v1/auth/login`, `POST /api/v1/auth/reset-password` (rate-limit + chặn IP ngoài LAN); `GET /api/v1/snapshots/files/...` (serve ảnh — `<img>`/`<a>` không gửi được header Authorization) tự bảo vệ bằng `get_snapshot_access`: header Bearer JWT thường HOẶC token snapshot riêng khoá cứng theo đúng 1 path + hạn ngắn (`snapshot_token_ttl_seconds`, mặc định 10 phút) — KHÔNG chấp nhận JWT đăng nhập qua query nữa (tránh lộ JWT toàn quyền 7 ngày qua URL ảnh); `POST /api/v1/streaming/mediamtx-auth` (MediaMTX gọi server-to-server). **WebSocket `/ws/cameras/{id}` để mở** (không version) nhưng validate JWT qua query `?token=` trước khi accept.
   - Credential lưu DB `admin_users` (pbkdf2_sha256), seed **admin/admin**. FE lưu token ở `localStorage` (`scp_token`), `api()` tự gắn Bearer, 401 → `clearToken()` + `/login`.
   - JWT hết hạn: `jwt_expire_minutes` (hiện **10080 = 7 ngày**).
6. **DB không dùng Alembic** — `init_db` tự `create_all` (bảng mới) + `_ensure_runtime_schema` ALTER thêm cột. Xem [backend.md](backend.md).
7. **Toàn bộ thời gian là UTC** (`datetime.utcnow`); frontend format `vi-VN` khi hiển thị.
8. **occupancy của bãi = đếm session đang mở** (`exit_time IS NULL`) theo `lot_id`; `available = capacity - occupied`.
9. **Bẫy Windows:** `print()` có ký tự "đ" gây `UnicodeEncodeError` trên console cp1252 → chạy backend với `PYTHONIOENCODING=utf-8`. Đã bỏ "đ" khỏi log check-out.
10. **`_CAMERA_MANAGER` là biến global** để callback RFID-USB (ngoài request context) vẫn chụp được ảnh.
11. **AI nhận diện biển số là OPTIONAL theo từng bãi** (`ParkingLot.ai_enabled`, mặc định `False`). Bãi bật AI: check-in gọi `camera_manager.test_camera_ai()` on-demand ngay lúc quẹt thẻ để tự điền biển; check-out detect lại rồi so với biển lúc vào → `ParkingSession.ai_plate_match`. **KHÔNG chặn check-out dù mismatch** — chỉ đánh dấu để soát lại. Xem [rfid.md](rfid.md).
12. **Stream camera hybrid (mới):** camera `rtsp://` xem qua **WebRTC** (MediaMTX), camera HTTP/MJPEG qua **JPEG-over-WS**. Xem [streaming-architecture.md](streaming-architecture.md).

---

## 1. Hệ thống là gì

Quản lý **bãi giữ xe thông minh** kết hợp:
- **Camera (RTSP/HTTP)** → stream live + nhận diện biển số (ANPR) bằng AI.
- **RFID (USB serial hoặc HTTP)** → quẹt thẻ check-in/check-out.
- **Ghép RFID ↔ Biển số** → tạo phiên gửi xe, chụp snapshot vào/ra.

**Tech stack:**
- Backend: **FastAPI + SQLAlchemy 2.0 + PostgreSQL** (MVC theo module), OpenCV camera, YOLOv5 ONNX (ANPR), pyserial (RFID USB).
- Frontend: **Vanilla JS (ES modules) + HTML + CSS**, không framework/bundler.
- Realtime: **WebRTC** (RTSP, qua MediaMTX) + **WebSocket JPEG** (HTTP/MJPEG).

---

## 11. Luồng nghiệp vụ end-to-end

**Xe VÀO:**
1. Camera cổng vào stream → (nếu bật inference) đọc biển số → lưu `PlateRead(linked=False)`.
2. Tài xế quẹt RFID → `ingest_rfid_event(direction="in")`.
3. Ghép biển số (payload / thẻ đã đăng ký / PlateRead chưa link trong 30s) → tạo `ParkingSession(status="in")` + chụp ảnh cổng vào.

**Xe RA:**
1. Quẹt RFID `direction="out"` → tìm session đang mở của thẻ.
2. (Nếu có biển) so khớp; khớp → đóng session (`status="out"`, `exit_time`) + chụp ảnh ra; lệch tường minh (`payload.plate`) → `plate_mismatch` (chặn). AI mismatch → chỉ đánh dấu, không chặn.

**Hiển thị:** Overview (KPI + live cam), History (phiên + nhận diện), Logs (sự kiện tổng hợp), Parking Lots (live + ảnh capture + log riêng từng bãi).

---

## 12. Điểm cần lưu ý khi phát triển

- **Inference realtime mặc định tắt** → ANPR nền cần `STREAM_ENABLE_INFERENCE=true` + `STREAM_INFER_EVERY_N_FRAMES>0` + recognizer.
- Thời gian toàn hệ thống là **UTC**; FE format `vi-VN`.
- Snapshot lưu theo ngày; biển số/thẻ được "làm sạch" khi đặt tên file.
- Migration runtime chỉ thêm cột cho `parking_sessions`/`parking_lots`/`rfid_events`/`cameras` (những chỗ đã khai); schema khác cần xử lý thủ công. Xem [backend.md](backend.md).
- Camera `rtsp://` (WebRTC) không tốn luồng backend khi AI tắt; camera HTTP/MJPEG mỗi cái vẫn tốn luồng capture/encode khi có người xem. Xem [streaming-architecture.md](streaming-architecture.md).
- `_CAMERA_MANAGER` global tồn tại để callback RFID USB (ngoài request context) vẫn chụp được ảnh.
- **Xóa bãi xe (chính sách, 2026-07-21):** còn phiên gửi xe (đang gửi hay đã ra) → `DELETE` mặc định trả 409 kèm số liệu cụ thể ("còn N xe đang gửi và tổng M phiên... Bạn có chắc chắn muốn xóa?") để FE hỏi lại bằng popup xác nhận; xác nhận thì gọi lại `?force=true` → xóa bãi nhưng **KHÔNG xóa log** — `ParkingSession`/`RfidEvent` chỉ bị ngắt `lot_id` về NULL (giữ nguyên toàn bộ dữ liệu, chỉ mất thông tin "thuộc bãi nào"). Xóa camera: còn gắn ở lịch sử phiên (`entry/exit_camera_id`) → CHẶN cứng (không có force), hướng dẫn dùng nút Tắt (`Camera.enabled`); chỉ còn gắn ở cấu hình bãi/`plate_reads` rời → cho xóa, tự gỡ tham chiếu. Xem [changelog.md](changelog.md) 2026-07-21.
