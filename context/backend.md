# Backend reference

> Cấu trúc file & "mở file nào" xem [code-map.md](code-map.md). File này mô tả **logic** các
> phần backend không thuộc stream (stream xem [streaming-architecture.md](streaming-architecture.md))
> và không thuộc RFID (xem [rfid.md](rfid.md)).

## 3. Mô hình dữ liệu (SQLAlchemy models)

| Bảng | File | Trường chính |
|---|---|---|
| `cameras` | cameras/model.py | id, name, source_url, enabled, created_at, updated_at |
| `plate_reads` | plates/model.py | id, camera_id(FK), plate, confidence, seen_at, **linked**, snapshot_path |
| `parking_sessions` | sessions/model.py | id, plate, rfid_card, entry_time, exit_time, status("in"/"out"), lot_id(FK), entry_camera_id, exit_camera_id, entry_snapshot_path, exit_snapshot_path, **fee**, **duration_minutes**, **ai_plate_match**, **ai_exit_plate** |
| `rfid_events` | rfid/model.py | id, card_id, direction, source, received_at, payload_json, **lot_id**(FK) |
| `rfid_cards` | rfid/model.py | id, card_id(unique), plate, owner_name, is_active, created_at |
| `parking_lots` | parking_lots/model.py | id, name(unique), **capacity**, entry_camera_id, exit_camera_id, **ai_enabled**, **rfid_usb_port**, created_at, updated_at. Cột `is_active` cũ vẫn tồn tại vật lý trong DB (không có gì để xoá cột trong migration append-only) nhưng KHÔNG còn dùng ở code nào (bỏ 2026-07-21) |
| `admin_users` | auth/model.py | id, username(unique), password_hash (pbkdf2_sha256), created_at, updated_at — seed admin/admin |

- `LogEntry`/`LogType` (logs/model.py) **không phải bảng** — object thuần gom log nhiều bảng.
- Thời gian **UTC** (`datetime.utcnow()` qua `base.utcnow`).
- **Sentinel `__NONE__`**: check-in chưa biết biển → `plate="__NONE__"`; ra UI map về `None`.

### init_db & migration runtime (KHÔNG Alembic)
`database/session.py:init_db()` (1 lần lúc startup):
1. `Base.metadata.create_all(bind=engine)` — **chỉ tạo bảng CHƯA tồn tại**, đủ cột theo model. Bảng đã có → bỏ qua.
2. `_ensure_runtime_schema()` — migration thủ công nhẹ: `inspect(engine)` so cột hiện có với mong đợi rồi `ALTER TABLE ADD COLUMN` cho cột thiếu (idempotent).
   - `parking_sessions`: `lot_id`, `exit_camera_id`, `entry_snapshot_path`, `exit_snapshot_path`, `fee`, `duration_minutes`, `ai_plate_match`, `ai_exit_plate`.
   - `parking_lots`: `capacity`, `ai_enabled`, `rfid_usb_port`.
   - `rfid_events`: `lot_id`.
   - Index `ix_sessions_lot_exit (lot_id, exit_time)` cho occupancy.

**Xử lý DB rỗng/thiếu cột:** thiếu bảng → `create_all` dựng đủ; bảng cũ thiếu cột → `_ensure_runtime_schema` thêm; bảng rỗng row → không lỗi (mọi count `or 0`, list `[]`, chia có guard). **Gap:** migration chỉ phủ các bảng liệt kê trên; thêm cột bảng khác trên DB đã tồn tại phải bổ sung tay. Không có Alembic/rollback; không seed (trừ admin).

## 4. Vòng đời ứng dụng (`main.py`)

`lifespan` startup:
1. `init_db()` — tạo bảng + migrate.
2. `ensure_admin_seed(db)` — seed admin/admin nếu rỗng.
3. `load_plate_recognizer(settings.plate_recognizer)`.
4. Tạo `CameraStreamManager` + `StreamConfig` → `app.state.camera_manager` + global `_CAMERA_MANAGER`; `bootstrap_enabled_cameras()`.
5. `RfidReaderManager` (nhiều đầu đọc USB) → callback `_handle_rfid_from_usb`.

Shutdown: dừng RFID reader + `camera_manager.shutdown()`.

**Middleware/route:** CORS (allow_credentials=False), `disable_api_cache` (no-store cho `/api/*` + `/health`), `GET /health`, `include_router(api_router)`, `GET /` → index.html, catch-all serve static (chặn path traversal, loại prefix api/docs/ws...).

## 5. Cấu hình (`core/config.py` ← `.env`)

- **DB/Auth:** `database_url`, `admin_username/password` (chỉ seed).
- **JWT:** `jwt_secret` (⚠️ đổi ở prod), `jwt_algorithm`(HS256), `jwt_expire_minutes`(**10080=7 ngày**).
- **RFID link:** `rfid_link_window_seconds`(30).
- **Recognizer:** `plate_recognizer` (`module:Class`), `plate_detector_model`/`plate_ocr_model`/`plate_detector_imgsz`(640)/`plate_detector_conf`(0.5)/`plate_ocr_conf`(0.6).
- **Phí & sức chứa:** `parking_currency`("đ"), `parking_fee_base`(0), `parking_fee_per_block`(5000), `parking_fee_block_minutes`(60), `parking_free_minutes`(15), `parking_default_capacity`(50). Công thức: `base + ceil(max(0, phút-free)/block) * per_block`.
- **Stream:** `stream_target_fps`(25), `stream_jpeg_quality`(82), `stream_max_width`(1280), `stream_capture_skip_grabs`(1, chỉ áp rtsp), `stream_ws_target_fps`(25), `stream_rtsp_transport`(tcp), `stream_ffmpeg_capture_options` (max_delay 10ms...), `stream_infer_every_n_frames`, `stream_enable_inference`(false), `stream_plate_dedupe_seconds`(8), `stream_periodic_reconnect_seconds`(1800). Stream WebRTC/MediaMTX: xem [streaming-architecture.md](streaming-architecture.md).
- **Lưu trữ:** `ai_models_dir`, `snapshot_store_dir`.
- **RFID USB:** `rfid_usb_port`, `rfid_usb_baudrate`(115200), `rfid_usb_queue_max_size`(500), `rfid_usb_enabled`.

`get_settings()` `@lru_cache` → singleton.

## 7. Nhận diện biển số (`services/plate_recognizer.py` + recognizers)

- `PlateDetection(plate, confidence, box)` — dataclass.
- `PlateRecognizer` — Protocol: `detect(frame_bgr) -> list[PlateDetection]`.
- `normalize_plate(raw)` — uppercase + bỏ ký tự không phải `[A-Z0-9]`.
- `load_plate_recognizer(spec)`: `module:Class` import động → PaddleOCR → Dummy (fallback).
- **`YoloOnnxPlateRecognizer`** (mặc định, `.env`): YOLOv5 ONNX 2 giai đoạn — detect vùng biển → deskew (Hough) → detect TỪNG KÝ TỰ (30 class) → tự nhận 1 dòng/2 dòng → ghép qua `normalize_plate`. Output ONNX raw KHÔNG có NMS → tự decode + NMS numpy. Model ở `AI_MODELS_DIR` (`LP_detector.onnx` + `LP_ocr.onnx`). Xem [changelog.md](changelog.md) 2026-07-14 ANPR, 2026-07-21 tối ưu.
  - **Lọc box trước khi OCR** (`plate_detector_max_boxes`=2, `plate_min_box_width`/`plate_min_box_height`): 1 camera = 1 làn xe nên chỉ OCR N box tự tin nhất, bỏ box quá nhỏ (không thể chứa ký tự đọc được) — vừa nhanh (bớt lượt OCR thừa trên box nhiễu) vừa an toàn (bớt nguồn sinh biển rác).
  - **Lọc chuỗi rác sau OCR**: bỏ chuỗi có ≥6 số liên tiếp (biển VN thật không có) — chặn các lần OCR đọc nhầm 1 box không-phải-biển ra chuỗi dài toàn số.
  - **OCR candidate thử LẦN LƯỢT** (deskewed trước nếu có lệch, raw nếu không) thay vì luôn chạy CẢ 2 vô điều kiện — dừng ngay khi candidate đầu đã đọc được ≥6 ký tự (đủ tốt), không tốn thêm 1 lượt inference OCR đầy đủ nếu không cần.

## 9. Các module API (dưới `/api/v1`, đều cần JWT trừ ghi chú)

- **auth** (`/auth`): `POST /login` (public, trả `TokenResponse`), `GET /me`, `POST /change-password` (username từ token), `POST /reset-password` (public, không điều kiện). `security.py` (JWT), `dependencies.py` (`get_current_user`), `service.py` (pbkdf2 + seed).
- **cameras**: `GET/POST /cameras`, `PATCH/PUT/DELETE /{id}`, `GET /{id}/webrtc` (dò WebRTC), **`WS /ws/cameras/{id}`** (JPEG, validate token qua query). `validate_camera_source` bắt buộc `rtsp://`/`http(s)://`.
- **streaming**: `POST /streaming/mediamtx-auth` (public, MediaMTX gọi). Xem [streaming-architecture.md](streaming-architecture.md).
- **plates**: `GET /plates?limit` — join `plate_reads` + camera name.
- **sessions**: `GET /sessions?active_only&limit` — `compute_fee`/`compute_duration_minutes`; phí/thời gian CHỐT lúc check-out; map `__NONE__`→null.
- **dashboard**: `GET /dashboard/summary` (camera/session/vào-ra/capacity/occupancy/revenue), `GET /dashboard/stats?days=N` (daily/by_hour/avg_duration/revenue).
- **logs**: `GET /logs?limit&hours` — gom RfidEvent + PlateRead + ParkingSession → `LogEntry`, kèm `*_snapshot_url`.
- **parking_lots**: CRUD `/parking-lots` (tên unique, capacity, occupancy), `GET /snapshots`, `GET /{id}/overview`, `GET /{id}/capture-status` (nhẹ, cho poll chip realtime), `GET /snapshots/files/{folder}/{filename}` (chặn path traversal + `get_snapshot_access`: header Bearer JWT thường HOẶC token snapshot riêng khoá theo đúng path, hạn ngắn — KHÔNG public, xem mục 0.5/12 overview.md). `delete_parking_lot(force=False)`: còn `ParkingSession` (bất kỳ trạng thái) → 409 kèm số xe đang gửi/tổng phiên, để FE hỏi lại người dùng; gọi lại `force=True` → xóa bãi nhưng GIỮ LẠI log (`ParkingSession`/`RfidEvent` chỉ bị `UPDATE ... SET lot_id=NULL`, không xóa dữ liệu). `delete_camera` (cameras/service.py) cùng nguyên tắc: còn `ParkingSession` tham chiếu → 409; chỉ còn gắn ở cấu hình `ParkingLot.entry/exit_camera_id` hoặc `plate_reads` rời → xóa kèm gỡ tham chiếu (set NULL ở lot, xóa plate_reads đó). Xem [changelog.md](changelog.md) 2026-07-21.

> **Bảo vệ tập trung (`router.py`):** `api_v1 = APIRouter(prefix="/api/v1")`; router nghiệp vụ include kèm `dependencies=[Depends(get_current_user)]`. Public: auth + streaming + snapshot_files. WS router include ở gốc (ngoài `/api/v1`).
