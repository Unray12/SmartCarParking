# Nhật ký thay đổi

> Mới nhất ở trên. Đánh giá clean-code & nguyên tắc mở rộng gần đây nằm ở cuối mỗi entry.

### 2026-07-19 — Stream hybrid WebRTC + JPEG, on-demand, refactor DRY, pin MediaMTX
**Kiến trúc stream (xem [streaming-architecture.md](streaming-architecture.md)):**
- Thêm **MediaMTX** (service Docker) làm media server: camera `rtsp://` → WebRTC (WHEP) tới browser, không re-encode. Camera HTTP/MJPEG giữ đường JPEG-over-WS. FE tự chọn qua `GET /cameras/{id}/webrtc`.
- `services/mediamtx.py` (`MediaMTXClient`, Control API), `modules/streaming/controller.py` (`mediamtx-auth`, xác thực JWT/token nội bộ). `camera_stream.py` đọc RTSP từ MediaMTX re-publish (camera chịu 1 kết nối).
- **On-demand:** `CameraWorker` chỉ chạy capture/encode khi có viewer JPEG hoặc bật AI; bỏ infer thread khi AI tắt. `IntersectionObserver` (FE) chỉ stream card đang thấy → nhẹ khi nhiều cam.
- **Tối ưu trễ:** WebRTC `playoutDelayHint=0` + video-only; latest-wins mọi tầng (không FIFO); camera khuyến nghị Profile Low/GOP ngắn/CBR. `max_delay` 100→10ms (đường JPEG/AI).
- **Giữ phiên FE:** URL hash + localStorage (`scp_nav_v1`) → refresh/back-forward giữ trang + bãi/camera đang mở. UX: chống double-submit, Esc đóng modal. Chip trạng thái luồng trên header (WebRTC/JPEG/connecting/error).
- **JWT 12h → 7 ngày** (`jwt_expire_minutes=10080`).

**Refactor (clean-code, xem đánh giá bên dưới):**
- Tách `js/jpeg-stream.js` (`createJpegCanvasPlayer`) — gộp logic JPEG→canvas bị **lặp 3 nơi** (card/focus/lot) thành 1 module tái sử dụng. Dọn import thừa (`wsCameraUrl`), helper chip chung `setStreamStatusChip`.
- Tài liệu context tách folder `context/` theo chủ đề; `CONTEXT.md` gốc rút gọn thành hướng dẫn + index.

**Bug đã sửa:** MediaMTX replace path dùng sai method `PATCH` → đúng là **POST** `/v3/config/paths/replace` (lộ khi backend restart mà MediaMTX còn giữ path cũ URL đã đổi).

**Hạ tầng:** pin `bluenviron/mediamtx:1.19.2` (không `:latest`) tránh bản mới đổi API gây vỡ.

**Verify (Docker thật):** smoke test API không 500; WS JPEG on-demand giao frame JPEG hợp lệ; mediamtx-auth 204/401 đúng; path add/replace/delete đúng; camera không kết nối được → 200 `frame_available:false`, không crash; restart count = 0. WebRTC media (rtsp thật) đã xác nhận chạy qua ảnh chụp thực tế.

**Đánh giá clean-code:** codebase module hoá tốt (BE MVC domain, FE tách theo trang); vi phạm DRY chính (JPEG lặp 3 nơi) đã sửa. **Nguyên tắc mở rộng:** thêm hành vi hiển thị → sửa `stream.js` (điểm điều phối), consumer chỉ cấp element + callback, KHÔNG lặp WS/decode; backend giữ latest-wins + on-demand.

### 2026-07-18 — Poll riêng tần suất cao cho chip trạng thái RFID (gần realtime) + xanh (OK) hiện lâu hơn
- Endpoint nhẹ `GET /parking-lots/{id}/capture-status` (`LotCaptureStatusOut`: latest_in/out, paired_in_for_out, rejected_in/out) — 4 query `LIMIT 1`, rẻ hơn `/overview`. FE `applyCaptureStatus(status, lotId)` + poll riêng `CAPTURE_STATUS_POLL_MS=1000` (setTimeout-sau-khi-xong), độc lập nhịp `/overview`. `OK_PULSE_MS` 2000→4000 (xanh lâu hơn vàng/đỏ). Dừng poll khi đóng chi tiết/rời view/logout.

### 2026-07-18 — Bug: quẹt THÀNH CÔNG bị hiện sai thành cảnh báo (do fix trước)
- `rejected_events` luôn trả sự kiện cũ; poll đầu tiên coi là "mới" (dedup so `null`) → pulse vàng đè xanh. Sửa: `rejectedBaselineLotId` — lần đầu mỗi bãi chỉ **âm thầm ghi nhận** key, không pulse; chỉ pulse từ poll thứ 2 khi có key mới. `setCaptureStatusIdle()` reset baseline. (Pattern giống `hasSyncedInitialLogs` ở `rfid.js`.)

### 2026-07-18 — Bug: chip cảnh báo (already_in/not_found) không hiện ở "Chi tiết bãi xe"
- `renderRejectedRfidStatus` cũ chỉ lấy `events[0]` (mới nhất chung 2 hướng) → sự kiện hướng còn lại bị bỏ. Sửa: tìm mới nhất RIÊNG từng hướng (`in`/`out`), pulse cả 2 chip. Bug 2 (cùng khu vực): pulse xanh/vàng dùng chung dict dedup → tách `lastRejectedPulseKeys` riêng.

### 2026-07-18 — Hiển thị biển AI đọc lúc "Không khớp" + tăng cỡ chữ overlay
- Log chi tiết bãi hiện cùng biển 2 dòng nhưng báo "Không khớp": do so `session.plate` (chốt lúc vào) với biển AI đọc lúc RA (`ai_plate`, trước không lưu). Thêm cột `ParkingSession.ai_exit_plate` (+ migration) lưu biển AI lúc ra; FE hiện `(AI đọc: ...)` cạnh chip. `ai.js:drawLiveOverlay` chữ 16→22px.

### 2026-07-18 — Tối ưu AI Center live-test cho NUC
- FE `ai.js`: bỏ `setInterval` → vòng tự lên lịch (`await` xong mới `setTimeout`), cờ `liveState.polling` (tránh inference chồng lấn trên NUC). BE `camera_stream.py`: thêm `latest_frame_bgr()` (frame BGR gốc, không qua JPEG); `test_camera_ai` dùng thẳng thay vì `imdecode` lại → bớt encode→decode dư; snapshot nét hơn (không nén kép).

### 2026-07-18 — Hiển thị lượt quẹt RFID BỊ TỪ CHỐI theo từng bãi
- `RfidEvent` thêm `lot_id` (+ migration) — lưu bãi ĐÃ RESOLVE. `get_parking_lot_overview` trả 20 sự kiện `already_in`/`not_found` gần nhất của bãi (`rejected_events`). FE `parking.js`: chip 3 trạng thái ok/off/warn, `pulseRejectedStatus` route đúng hướng, message + mã thẻ, tự tắt 3s. CSS `.capture-status.is-warn`.

### 2026-07-16 — Chống trễ tích lũy (reconnect định kỳ)
- `cap.grab()`/`retrieve()` đọc TUẦN TỰ từ buffer FFmpeg/OS → backlog không tự co nếu vòng capture từng chậm; reconnect cũ chỉ trigger khi lỗi thật. Sửa: track `cap_opened_at`, mỗi vòng nếu `now - cap_opened_at >= stream_periodic_reconnect_seconds` (mặc định 1800s, 0=tắt) → chủ động release + reconnect (phiên mới từ "hiện tại", xóa backlog). Độc lập reconnect-khi-lỗi.

### 2026-07-16 — Bug: RFID bãi thứ 2 không nhận + cổng RFID riêng theo bãi
- Root: `_handle_rfid_from_usb` không set `lot_id` → `_resolve_lot(None)` luôn về bãi active đầu tiên. Quyết định: mỗi bãi 1 đầu đọc vật lý riêng (cổng USB khác nhau). Thêm `parking_lots.rfid_usb_port` (+ migration, cấu hình qua UI, không cần restart); **`RfidReaderManager`** quản lý nhiều reader, guard trùng cổng. `main.py`/`dependencies.py`/`parking_lots` đồng bộ reader khi CRUD bãi.

### 2026-07-16 — Test stream RTSP thật (2 cam Hikvision) + fix rò rỉ resource lúc logout
- 2 cam RTSP FullHD song song 45s: 0 lỗi grab/retrieve, FPS ~24.5, jitter thấp. `capture_skip_grabs=1` → FPS giảm nửa (không có backlog thật) → giữ `0`. Bug: `stopApp()` (logout) thiếu `parking.closeLotDetailStreams()` + `ai.stopAiLiveTest()` → WS/interval chạy ngầm sau logout. Đã thêm.

### 2026-07-16 — Tối ưu tốc độ đọc RFID (firmware + backend) + debounce theo thời gian
- Firmware: gọi thẳng `readTagID()` (bỏ `scan_card()` 2 lần), `POLL_INTERVAL_MS` 200→60, debounce theo thời gian (`DEBOUNCE_MS=1000`, `ticks_diff`). Backend: gộp 2 DB session thành 1 (giảm 1 round-trip pool); debounce lưới an toàn thứ 2 (`_rfid_debounced`, 1s).

### 2026-07-16 — Camera H.265→H.264 + siết max_delay 100→10ms
- Camera prod đổi H.264 (CBR, GOP ngắn, Smoothing thấp — trên trang camera). `stream_ffmpeg_capture_options`: `max_delay` 100000→10000 (verify sạch tới 1ms trên 2 cam prod). Đồng bộ `allowed_media_types;video`. Retest `capture_skip_grabs=1` vẫn giảm nửa FPS → giữ 0. Giữ TCP. (Ghi chú: MSE-over-WS từng làm rồi bị xóa theo yêu cầu — xem git log.)

### 2026-07-14 — ANPR thật (YOLOv5 ONNX) + AI theo bãi + so khớp lúc check-out
- Model `LP_detector.onnx` + `LP_ocr.onnx` (YOLOv5 2 giai đoạn: detect biển + detect TỪNG KÝ TỰ 30 class; convert từ .pt, nhúng metadata vào onnx; output raw không NMS → tự decode+NMS numpy). `YoloOnnxPlateRecognizer` (pipeline letterbox→detect→deskew Hough→detect ký tự→1/2 dòng→`normalize_plate`). `ParkingLot.ai_enabled` (default False): check-in gọi `test_camera_ai` on-demand điền biển; check-out detect lại → `ai_plate_match` (KHÔNG chặn dù mismatch). Migration `ai_enabled`/`ai_plate_match`. FE: checkbox + toggle nhanh + cột AI + toast.

### 2026-07-14 — Docker hóa + UI tự scale + test suite Playwright
- 3 service compose (db/backend/frontend); config qua `env_file: .env` root (không đụng `backend/.env`, `.dockerignore` tránh bake secret); data gom `backend/data/`. Bug fix: Dockerfile bỏ cài `ffmpeg` hệ thống (opencv-headless đã có). UI: `font-size: clamp(...)` scale theo màn + breakpoint màn lớn. Bug fix: `delete_parking_lot` bắt `IntegrityError` → 409 (không cho xóa bãi còn phiên). Test: Playwright 2 project (backend API + frontend E2E), `workers:1`, 82/82 pass. Xem `tests/README.md`.

### 2026-06-25 — Login 1 khung + tối ưu NUC + Postman
- Login 1 khung + modal reset. DB: `dashboard_summary` dùng SQL `COALESCE(SUM(fee),0)`; `dashboard_stats` select 4 cột; index `ix_sessions_lot_exit`; pool gọn. FE polling chỉ refresh view đang xem. Máy yếu: hạ FPS 18-20.

### 2026-06-25 — FE/BE tách rời (redirect tương đối)
- Redirect login dùng path tương đối (`login.html`/`index.html`) → FE chạy độc lập `:5173` gọi BE `:8010` (CORS `*`), hoặc BE serve FE `:8010`.

### 2026-06-25 — Tách frontend thành module/trang
- `main.js` 1796 → ~247 dòng (orchestrator). Tách `dom/ui/layout/account.js` + `views/*`. ESM singleton, cross-view qua callback. Logic giữ nguyên 100%.

### 2026-06-25 — Bảo vệ API bằng JWT + RESTful /api/v1 + trang login riêng
- PyJWT HS256 (`security.py`/`dependencies.py`, `JWT_SECRET`/`JWT_EXPIRE_MINUTES`). Login trả `TokenResponse`; `GET /me`; change-password lấy username từ token. `router.py` gom `/api/v1` + `get_current_user`; public: auth + snapshot_files; WS ngoài version. Đổi tên: `/plates/recent`→`/plates`, `/rfid/events`→`/rfid-events`, `/ai/upload-model`→`/ai/models`. FE: token localStorage, 401→login, trang login riêng.

### 2026-06-25 — Hệ thống đăng nhập thật + responsive
- Bảng `admin_users` (pbkdf2_sha256 stdlib, seed admin/admin). `authenticate`/`change_password`/`reset_password`. Responsive: `min-width:0` cho grid con, breakpoint 1180/720/480/360, drawer sidebar.

### 2026-06-25 — Lưu phí vào DB + bỏ glow button
- `parking_sessions.fee` + `duration_minutes` (+ migration). Check-out CHỐT & lưu phí/thời gian; dashboard/sessions ưu tiên giá trị đã lưu, fallback tính lại cho row cũ.

### 2026-06-24 — Redesign UI/UX + IA + tính năng mới
- `parking_lots.capacity` (+ occupancy). Phí gửi xe (`parking_fee_*`, `compute_fee`/`compute_duration_minutes`). Dashboard summary + `stats`. Bug fix: `print()` ký tự "đ" gây `UnicodeEncodeError` → bỏ (dùng `PYTHONIOENCODING=utf-8`). FE: IA mới, stream ở view `cameras`, chart Canvas tự vẽ.

### 2026-06-24 — Tối ưu độ mượt & trễ stream (MJPEG/WS)
- `CAP_PROP_BUFFERSIZE` 3→1; bỏ "grab thừa" ép buộc (cũ giảm nửa FPS); bỏ sàn sleep; WS poll 0.005→0.002s; FPS 12→25.

### 2026-06-24 — Fix chớp/blink khung live Parking Lots
- Poll gọi lại `openParkingLotDetail` mỗi ~3s luôn đóng+mở WS → chớp. Sửa: `ensureLotStreams` chỉ dựng lại WS khi camera đổi hoặc socket chết (track `stream*CamId`); render dữ liệu vẫn refresh. Lot stream tự reconnect. (Lưu ý: cơ chế lot stream sau này chuyển sang `createStreamSession` — xem 2026-07-19.)
