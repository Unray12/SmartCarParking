# RFID — đọc thẻ & logic check-in/out (nghiệp vụ trung tâm)

## Đọc RFID qua USB (`services/rfid_usb_reader.py`)
- `RfidUsbReader`: 2 luồng — `_read_loop` (đọc serial) + `_consume_loop` (gọi callback). Parse dòng serial bằng regex `\{(in|out):\s*([0-9A-Fa-f:]*)\}` → `(direction, card_id)`. Hàng đợi giới hạn (đầy → bỏ event cũ nhất). Tự reconnect serial. Thiếu `pyserial`/`enabled=False` → bỏ qua êm.
- **`RfidReaderManager`**: quản lý NHIỀU reader cùng lúc — 1 reader/bãi có cổng riêng (`ParkingLot.rfid_usb_port`) + 1 reader "mặc định" (`RFID_USB_PORT`) cho bãi chưa gán cổng. Mỗi reader gọi callback kèm đúng `lot_id` (`None` = cổng mặc định). Tự đồng bộ động khi bãi CRUD (`upsert_lot`/`remove_lot`, cùng pattern `CameraStreamManager`), không cần restart. **Guard trùng cổng:** cổng mặc định trùng cổng bãi đã gán → reader mặc định tự dừng nhường (tránh "port busy").
- Callback `main.py:_handle_rfid_from_usb(direction, card_id, lot_id=None)`: dùng CHUNG 1 DB session cho tra thẻ (`get_rfid_card`) + `ingest_rfid_event` (giảm 1 round-trip pool). Có **debounce backend** (`_rfid_debounced`, in-memory `(lot_id,direction,card_id)->last`, cửa sổ 1s) chặn ngay đầu callback — lưới an toàn thứ 2 độc lập với debounce firmware.

## Logic nghiệp vụ (`modules/rfid/service.py`) — QUAN TRỌNG NHẤT

**`ingest_rfid_event(db, payload, camera_manager)`**:
1. `_persist_event` — lưu `RfidEvent` thô (kèm `lot_id` ĐÃ RESOLVE, không phải `payload.lot_id` gốc).
2. `_resolve_lot` — bãi theo `lot_id`; null → bãi active đầu tiên.
3. Rẽ theo `direction`.

**Check-in (`_handle_check_in`)**:
- Thẻ đã có session mở (`exit_time IS NULL`) → `already_in`.
- Biển số: ưu tiên `payload.plate`; nếu bãi `ai_enabled` và chưa có plate tường minh → `_detect_plate_via_ai` (gọi `camera_manager.test_camera_ai(entry_camera_id)` on-demand, không cần bật inference nền); rồi tới `_latest_unlinked_plate` (PlateRead `linked=False` trong `rfid_link_window_seconds`); cuối cùng `__NONE__`.
- `entry_camera_id`: `lot.entry_camera_id` else camera của plate_read.
- `_capture_snapshot` cổng vào → tạo `ParkingSession(status="in")`; nếu dùng plate_read → `linked=True`. Trả `checked_in`.

**Check-out (`_handle_check_out`)**:
- Không có session mở → `not_found`.
- `payload.plate` tường minh + session có biển thật → so khớp; lệch → `plate_mismatch` (**chặn**, không đóng session).
- Nếu bãi `ai_enabled` → detect lại ở cam ra, so `session.plate` → `ParkingSession.ai_plate_match` (`None`/`True`/`False`); lưu biển AI đọc thực tế vào `ai_exit_plate`. **KHÔNG chặn check-out dù `False`** (khác `plate_mismatch`) — chỉ đánh dấu soát lại.
- Cập nhật `exit_time`, `status="out"`, **chốt & lưu** `fee`/`duration_minutes`, snapshot ra. Trả `checked_out`.

**`_capture_snapshot`**: ưu tiên frame AI vừa dùng; else lấy từ `camera_manager` (bump viewer on-demand, chờ frame — xem [streaming-architecture.md](streaming-architecture.md)); else mở `cv2.VideoCapture(source_url)` trực tiếp. Lưu `snapshots_store/YYYYMMDD/{direction}_cam{id}_{card}_{plate}_{ts}.jpg`.

**CRUD thẻ**: `list/get/create/update/delete_rfid_card`; `find_plate_by_card(card_id)` trả biển nếu thẻ active (giữ lại, không còn nơi gọi sau khi gộp session ở `main.py`).

## Endpoints (`modules/rfid/controller.py`)
`POST /api/v1/rfid-events` (ingest), `GET/POST /api/v1/rfid/cards`, `PUT/DELETE /api/v1/rfid/cards/{card_id}`. Đầu đọc USB gọi thẳng hàm `ingest_rfid_event` (không qua HTTP).

## Kịch bản bị từ chối (hiển thị theo bãi)
`already_in` (quẹt VÀO lần 2) và `not_found` (quẹt RA chưa có phiên) không tạo session → lưu ở `RfidEvent(result_status, lot_id)`. `get_parking_lot_overview`/`get_lot_capture_status` trả `rejected_events`/`rejected_in`/`rejected_out` để FE hiện chip vàng cảnh báo theo từng hướng (xem [changelog.md](changelog.md) 2026-07-18).

## Firmware (`yolouno_extension_rfid_i2c-main/main.py`)
- Gọi thẳng `readTagID()` (bỏ `scan_card()` gọi 2 lần), `POLL_INTERVAL_MS=60`, debounce theo thời gian (`DEBOUNCE_MS=1000`, dùng `ticks_diff`). Không sửa `rfid.py`/`rfid_expansion.py`.
