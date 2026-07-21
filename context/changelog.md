# Nhật ký thay đổi

> Mới nhất ở trên. Đánh giá clean-code & nguyên tắc mở rộng gần đây nằm ở cuối mỗi entry.

### 2026-07-21 — Nút "Giả lập quét RFID" ở Parking Lots (test không cần đầu đọc thật)
**Yêu cầu:** thêm 1 cờ bật/tắt (mặc định tắt) + nút nhỏ ở trang Parking Lots, bấm 1 lần =
quẹt Vào, bấm lần 2 = quẹt Ra - test nhanh luồng RFID không cần cắm đầu đọc thật.

**Đổi gì:**
- `core/config.py`: `Settings.rfid_test_mode_enabled` (mặc định `False`, `.env`:
  `RFID_TEST_MODE_ENABLED`). Expose qua `GET /health` (public, sẵn có) - FE đọc 1 lần lúc
  `initParking()`, không cần route riêng.
- FE `parking.js`: nút `#lotSimulateRfidBtn` trong panel "Chi tiết bãi xe" (ẩn hoàn toàn khi
  cờ tắt). Dùng 1 thẻ cố định `WEBTEST0001` (không phải thẻ thật, dễ nhận ra trong lịch sử);
  trạng thái Vào/Ra suy từ session list của bãi đang mở (`lotDetailState.testCardActive`),
  KHÔNG dùng biến toggle client-side độc lập - tự đồng bộ đúng dù refresh trang. POST thẳng
  `/api/v1/rfid-events` có sẵn, `source: "parking-lot-simulate-button"` để phân biệt trong
  log. Sau mỗi lần bấm, gọi lại `openParkingLotDetail` để đồng bộ log/occupancy ngay.

**Verify (Playwright thật, bật cờ tạm thời qua `.env` rồi tắt lại):** nút ẩn khi cờ tắt,
hiện khi bật; bấm lần 1 → nhãn đổi "(Vào)"→"(Ra)", tạo session `status=in`; bấm lần 2 →
nhãn đổi lại "(Vào)", session đóng `status=out` (entry/exit_time cách nhau ~1s đúng 2 lần
bấm). Đã dọn dữ liệu test + trả cờ về `false`.

### 2026-07-21 — Fix regression: tối ưu ANPR đợt 1 làm giảm độ nhạy nhận diện
**Người dùng báo:** sau khi tối ưu ANPR (entry ngay dưới), AI Center "kém nhạy, khó phát
hiện được biển số và nhận diện các ký tự so với trước". Rà lại bằng A/B test tự động (chạy
CẢ pipeline CŨ và MỚI trên cùng bộ ảnh snapshot thật, so kết quả từng ảnh) - không tìm được
khác biệt trên 10 ảnh mẫu sẵn có (mọi biển thật giữ nguyên y hệt), nhưng rà lại code tìm ra
**2 thay đổi có rủi ro thật dù chưa lộ trên bộ ảnh mẫu** (bộ mẫu chỉ có vài ảnh, không đại
diện hết setup camera/khoảng cách thực tế của người dùng):

1. **`plate_min_box_width`/`plate_min_box_height` (lọc box theo pixel trước OCR)** - đã
   verify lại: chỉ riêng `plate_detector_max_boxes` (chọn top-N theo confidence) ĐÃ ĐỦ loại
   2 box rác tìm thấy ở đợt 1 mà không cần lọc kích thước (test: tắt lọc size, giữ top-2 →
   ra kết quả giống hệt). Lọc cứng theo pixel là rủi ro THỪA, không cần cho fix gốc, nhưng
   có thể loại bỏ biển THẬT nếu camera của người dùng chụp biển nhỏ hơn ngưỡng (xa hơn/độ
   phân giải khác bộ ảnh mẫu) → **bỏ hẳn 2 setting này**, chỉ giữ lọc theo confidence.
2. **OCR "dừng sớm khi đủ ký tự" (`_GOOD_ENOUGH_CHAR_COUNT=6`)** - biển VN thật dài 7-9 ký
   tự, ngưỡng "đủ" (6) THẤP HƠN độ dài biển thật → có thể dừng ở candidate đọc THIẾU 1-2 ký
   tự trong khi candidate còn lại (raw hoặc deskewed) đọc được ĐỦ - **giảm độ chính xác đọc
   ký tự đúng như báo cáo**. Lợi ích tốc độ của tối ưu này cũng chưa từng đo được rõ ràng
   (ảnh benchmark thật tình cờ có `angle=0`, không kích hoạt nhánh dừng sớm) → **bỏ hẳn**,
   `_read_plate_text` quay lại luôn thử ĐỦ CẢ 2 candidate như code gốc (chỉ giữ refactor
   `_ocr_candidate` cho gọn code, không đổi hành vi).

**Còn giữ (đã verify không phải nguyên nhân, vẫn cần cho fix gốc):** top-N box theo
confidence (`plate_detector_max_boxes=2`) + lọc chuỗi rác ≥6 số liên tiếp sau OCR - cả 2 đã
verify lại bằng A/B test, không đụng tới độ nhạy phát hiện biển thật.

**Bài học:** 1 optimization "verify bằng benchmark" vẫn có thể regression nếu bộ dữ liệu
benchmark không đại diện đủ điều kiện thực tế (bộ ảnh mẫu chỉ 10 ảnh, ít loại camera/khoảng
cách) - khi người dùng báo hồi quy, ưu tiên bỏ phần rủi ro cao/lợi ích chưa rõ ràng trước,
giữ lại phần đã verify chắc chắn.

### 2026-07-21 — Tối ưu ANPR: nhanh hơn + chính xác hơn (benchmark trên ảnh/model thật)
**Đo bằng ảnh snapshot THẬT + model ONNX thật đang dùng (không giả lập)** trước khi sửa,
theo đúng nguyên tắc "profile trước khi optimize" của skill CV: 1 frame thực tế (ảnh
2026-07-14) ra **6 box "license_plate"** từ detector — có box chỉ **16x11px** (không thể
chứa ký tự đọc được), 2 box cỡ hợp lý khác OCR ra chuỗi RÁC ("59G163188" conf 0.71,
"59U116124" conf 0.607) suýt thắng biển thật ("50LD054" conf 0.733) trong
`max(detections, key=confidence)` ở `rfid/service.py` — **rủi ro gán nhầm biển thật lúc
check-in/out**. Mỗi box đều chạy OCR đầy đủ (2 candidate/box khi có góc lệch) → 1 frame
mất **2.7-3.6 giây** (đo lại 5 lần, model+ảnh thật, máy 12 core - trên NUC thực tế sẽ còn
chậm hơn).

**Fix (backend/app/services/yolo_onnx_plate_recognizer.py):**
1. Chỉ OCR tối đa `plate_detector_max_boxes` (mặc định 2) box tự tin nhất theo det_conf,
   bỏ hẳn box nhỏ hơn `plate_min_box_width`x`plate_min_box_height` (20x8px) trước khi OCR.
2. Bỏ chuỗi biển có ≥6 số liên tiếp (`_GARBAGE_DIGIT_RUN`) - biển VN thật không có format
   này, chặn được chính 2 chuỗi rác đo được ở trên mà không rủi ro chặn nhầm biển thật.
3. `_read_plate_text`: thử candidate khả năng cao hơn TRƯỚC (deskewed nếu lệch rõ), dừng
   ngay khi đọc được ≥6 ký tự - không còn chạy CẢ 2 candidate vô điều kiện mỗi khi có góc lệch.

**Verify (cùng ảnh, cùng model, đo lại):** frame 6-box nói trên → còn đúng 1 kết quả
`[('50LD054', 0.733)]` (2 chuỗi rác đã bị lọc), thời gian **2.7-3.6s → 1.2-1.8s** (tự đo,
~50% nhanh hơn với cấu hình mặc định `max_boxes=2`; test thêm `max_boxes=1` cho **0.66-1.0s**
nhưng bớt biên an toàn nếu box #1-theo-confidence không phải biển thật - giữ mặc định 2,
`max_boxes=1` là tùy chọn cho ai cần nhẹ hơn nữa và chấp nhận đánh đổi). Các frame chỉ có
0-1 box thật (đa số trường hợp bình thường) không đổi thời gian (~200-270ms, không tăng chi
phí). Áp dụng tự động cho cả 3 nơi dùng chung `recognizer.detect()`: AI Center live test,
AI on-demand lúc quẹt RFID (`_detect_plate_via_ai`), và ANPR nền (`STREAM_ENABLE_INFERENCE`).

### 2026-07-21 — Bỏ tính năng kích hoạt/hủy kích hoạt bãi xe (`ParkingLot.is_active`)
**Yêu cầu người dùng:** không thấy ý nghĩa thực tế, bỏ hẳn luồng "Kích hoạt bãi xe" (checkbox
form, chip Active/Inactive, cột "Trạng thái" ở bảng bãi). Tính năng này vừa được đề xuất làm
giải pháp thay cho xóa cứng (entry ngay trên) - nay không còn cần vì đã có force-delete giữ log.

**Đổi gì (bỏ khỏi TOÀN BỘ code, không chỉ UI):**
- `ParkingLot.is_active` xoá khỏi model + `ParkingLotCreate/Update/Out` schema.
- `rfid/service.py:_resolve_lot(lot_id=None)` (bãi mặc định cho cổng RFID chung) và
  `dashboard/service.py:dashboard_summary` (tổng `capacity`) bỏ filter `is_active` - fallback
  giờ là "bãi đầu tiên theo id" / "tổng tất cả bãi" (không còn khái niệm active/inactive).
- `rfid_usb_reader.py:RfidReaderManager` bỏ gate `lot.is_active` khi quyết định có khởi động
  đầu đọc riêng cho bãi hay không - còn lại điều kiện duy nhất là có gán `rfid_usb_port`.
- Hàm `get_default_active_lot` (parking_lots/service.py) xoá luôn - không còn nơi gọi.
- **Cột DB `is_active` KHÔNG xoá** (migration ở đây chỉ ADD, không rollback/xoá cột) - cột cũ
  NOT NULL nhưng vốn không có DEFAULT ở mức DB (default=True cũ chỉ là Python-side) nên thêm
  `ALTER COLUMN is_active SET DEFAULT true` (database/session.py) để cột mồ côi này không bao
  giờ chặn insert khi ORM không còn gửi giá trị cho nó nữa.
- FE: bỏ checkbox "Kích hoạt bãi xe" trong form, bỏ cột "Trạng thái"/chip Active-Inactive ở
  bảng bãi (colspan 12→11), đổi nhãn dropdown "Bãi mặc định (active)" → "(bãi đầu tiên)".
- Test suite: bỏ assertion `is_active` trong `parking-lots.spec.js`; `sessions-rfid.spec.js`
  đổi cleanup từ "vô hiệu hóa bãi" (PUT is_active=false, để lại rác vĩnh viễn qua các lần chạy
  test) sang xóa thật bằng `DELETE ?force=true` (nay giữ được lịch sử mà không cần is_active).

**Verify:** `import app.main` OK; test "xóa bãi xe có lịch sử -> 409" vẫn đúng hành vi cũ
(không phụ thuộc is_active).

### 2026-07-21 — Xóa bãi xe: đổi chặn cứng thành popup xác nhận, xóa bãi giữ nguyên log
**Yêu cầu người dùng (tinh chỉnh lại quyết định trước đó cùng ngày):** thay vì chặn cứng
409 không cho xóa khi bãi còn phiên gửi xe, đổi thành popup cảnh báo "còn xe/lịch sử, bạn
có chắc chắn muốn xóa?" - người dùng chọn Xóa hoặc Cancel. Nếu chọn Xóa: xóa bãi thật,
nhưng **log vẫn giữ lại** (không xóa `ParkingSession`/`RfidEvent`).

**Đổi gì:**
- `DELETE /api/v1/parking-lots/{id}` thêm query `force` (mặc định `false`). `force=false`
  + còn phiên → vẫn 409 (giữ message kèm số liệu cụ thể) nhưng bớt câu "không thể xóa"
  cứng, đổi thành hỏi "Bạn có chắc chắn muốn xóa?" - đây là tín hiệu cho FE hỏi lại, không
  còn là chặn tuyệt đối.
- `delete_parking_lot`: bỏ hẳn nhánh `DELETE FROM rfid_events` cũ (dọn cứng) - thay bằng
  `UPDATE parking_sessions/rfid_events SET lot_id = NULL WHERE lot_id = :id` cho MỌI
  trường hợp (force hay không, có phiên thật hay chỉ có rejected event) - nguyên tắc
  thống nhất: **xóa bãi không bao giờ xóa log**, chỉ ngắt liên kết.
- FE `parking.js:deleteLotWithConfirm` - gọi DELETE thường; bắt lỗi `409` (giờ `api.js`
  gắn `err.status` từ response, không chỉ `err.message`) → hiện `confirm()` thứ 2 với
  đúng message backend trả (đã có số liệu) + ghi rõ "log sẽ được giữ lại"; xác nhận thì
  gọi lại `?force=true`.

**Verify (API thật):** bãi có 1 phiên lịch sử → DELETE thường trả 409 đúng message mới;
DELETE `?force=true` → 200, bãi biến mất, session vẫn còn nguyên (status/fee/thời gian
không đổi) chỉ `lot_id` thành NULL.

### 2026-07-21 — Xóa bãi xe/camera: chính sách rõ ràng + fix crash 500 khi xóa camera
**Vấn đề:** `delete_parking_lot` chặn xóa bằng cách bắt `IntegrityError` chung (từ FK
`parking_sessions.lot_id` HOẶC `rfid_events.lot_id`) — thông báo "còn lịch sử phiên gửi xe"
dù thực ra có thể chỉ còn `RfidEvent` bị từ chối (already_in/not_found, chưa từng có xe
vào/ra thật), khiến user không xóa được bãi test/tạo nhầm dù chưa có nghiệp vụ thật nào.
Nặng hơn: `delete_camera` (`cameras/service.py`) **hoàn toàn không bắt `IntegrityError`** —
xóa camera đang gắn ở `parking_lots.entry/exit_camera_id`, `parking_sessions.entry/
exit_camera_id`, hoặc có `plate_reads` (camera_id NOT NULL) → crash 500 (bug đã biết từ
2026-07-14, xem overview.md cũ).

**Quyết định chính sách (người dùng chọn, không tự suy đoán vì ảnh hưởng mất dữ liệu):**
phiên gửi xe (`ParkingSession`) là lịch sử/doanh thu đã CHỐT, immutable — CHẶN CỨNG xóa bãi/
camera nếu còn tham chiếu tới ít nhất 1 phiên (dù đang gửi hay đã ra), hướng dẫn dùng
"Tắt hoạt động" (`ParkingLot.is_active`, đã có sẵn) / nút Tắt camera (`Camera.enabled`, đã
có sẵn) để ẩn mà KHÔNG mất lịch sử. Message 409 phân biệt rõ có bao nhiêu xe **đang gửi**
(nguy hiểm hơn) so với chỉ còn lịch sử đã đóng. Nếu KHÔNG còn phiên thật:
- Bãi chỉ còn `RfidEvent` bị từ chối (log quẹt thẻ đơn thuần, không phải lịch sử phí) → cho
  xóa, tự dọn (`DELETE FROM rfid_events WHERE lot_id=...`) trước khi xóa bãi.
- Camera chỉ còn gắn ở **cấu hình** bãi (`entry/exit_camera_id` — con trỏ cấu hình HIỆN TẠI,
  không phải lịch sử) → cho xóa, tự `UPDATE ... SET entry_camera_id=NULL` (bãi mất camera đã
  gán, chọn lại sau — FE `cameraNameById()` đã tự hiện "-" cho camera null/không tồn tại,
  không cần sửa FE). Camera chỉ còn `plate_reads` rời (chưa từng gắn vào phiên nào) → tự
  xóa các plate_reads đó trước khi xóa camera.

**Verify (Docker thật, không chỉ đọc code):** dựng camera+bãi+phiên test qua API thật —
xóa bãi/camera lúc phiên ĐANG GỬI → 409 đúng message có số xe đang gửi; check-out xong xóa
lại → vẫn 409 (đúng, giờ là lịch sử đã đóng) nhưng message đổi (không còn "đang gửi"); bãi
chỉ có RfidEvent bị từ chối → xóa 200, event bị dọn theo; camera chỉ gắn ở cấu hình bãi (chưa
từng có phiên) → xóa 200, cột camera của bãi tự về NULL (không dangling, không crash); camera
chỉ có plate_reads rời → xóa 200, plate_reads bị dọn theo. Dọn sạch toàn bộ dữ liệu test sau
khi verify.

### 2026-07-21 — Bảo mật: token JWT toàn quyền lộ qua URL ảnh snapshot
**Vấn đề (rà soát bảo mật lần 2):** `<img src>` không gắn được header nên URL ảnh snapshot
phải mang token qua query `?token=`. Trước đây FE tự đính THẲNG JWT đăng nhập (toàn quyền
API, hạn 7 ngày) vào URL đó (`get_current_user_flexible` chấp nhận bất kỳ JWT hợp lệ qua
query). URL ảnh dễ lộ hơn 1 header (log truy cập server, lịch sử trình duyệt, chia sẻ màn
hình) — lộ 1 URL ảnh = lộ luôn token toàn quyền tài khoản 7 ngày, không chỉ lộ đúng tấm ảnh
đó. Đây cũng là điều làm việc "đoán tên file ảnh" nguy hiểm: ai cầm được 1 token qua đường
này coi như cầm chìa khoá gọi mọi API, không chỉ xem ảnh.

**Fix:** Thêm token RIÊNG cho snapshot (`create_snapshot_token`, `security.py`) — JWT không
có claim `sub` (không dùng được như JWT đăng nhập ở các endpoint khác) mà có `scope=snapshot`
+ `path` khoá cứng vào đúng `{folder}/{filename}`, hạn ngắn (`SNAPSHOT_TOKEN_TTL_SECONDS`,
mặc định 600s). Backend tự nhúng token này vào `image_url`/`*_snapshot_url` ngay lúc build
(`resolve_snapshot_path_to_url`, `logs/service.py:_to_snapshot_url`) — FE không tự đính JWT
đăng nhập lên URL ảnh nữa (`ui.js:withToken` bỏ qua nếu URL đã có `token=`). Endpoint
`get_current_user_flexible` xoá (không còn nơi gọi) — thay bằng `get_snapshot_access`: chấp
nhận header Bearer JWT thường (Postman/API trực tiếp) HOẶC query token snapshot khớp CHÍNH
XÁC path đang xin; JWT đăng nhập nhét vào query bị từ chối (đóng đúng lỗ hổng cũ).

**Verify:** unit test trực tiếp `get_snapshot_access` (không cần DB) — token đúng path → qua;
cùng token, đổi filename (mô phỏng kẻ có URL lộ đi đoán ảnh khác) → 401; thiếu token → 401;
token hết hạn (chờ qua TTL) → 401; JWT đăng nhập qua header → vẫn qua (không vỡ Postman); JWT
đăng nhập nhét qua query (hành vi cũ) → 401 (xác nhận lỗ hổng đã đóng).

**Việc CHƯA làm (biết trước, chưa cần):** WebSocket `/ws/cameras/{id}` và WHEP MediaMTX
(`buildWhepUrl`) cũng đính thẳng JWT đăng nhập qua query cho lý do tương tự (browser không
gắn header được cho WS/POST cross-origin) — CHƯA áp dụng cùng kiểu token phạm vi hẹp vì cần
mint token mới liên tục theo phiên xem live (phức tạp hơn ảnh tĩnh) và chưa verify được bằng
browser thật trong lượt này; rủi ro thấp hơn ảnh (token WS/WHEP hết hạn theo JWT 7 ngày như
nhau, nhưng WS phải đang mở kết nối mới dùng được, không tự "xem lại" như ảnh) — cân nhắc áp
dụng cùng pattern nếu cần siết thêm.

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
