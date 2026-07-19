# 04 — Nhật ký refactor & đánh giá clean-code (2026-07-19)

## Đánh giá clean-code trước refactor
| Tiêu chí | Trước | Ghi chú |
|---|---|---|
| Module hoá | Khá tốt | BE theo MVC domain; FE tách file theo trang |
| SRP | Tốt | mediamtx/streaming đã tách riêng |
| DRY | **Kém ở 1 chỗ** | Logic JPEG→canvas lặp gần y hệt 3 nơi (card, focus, lot) |
| Dễ mở rộng | Tốt | `createStreamSession` là điểm chốt để thêm nguồn/hành vi |

## Đã refactor
1. **Tách `jpeg-stream.js`** (`createJpegCanvasPlayer`) — gộp logic JPEG-over-WS→canvas bị lặp 3
   nơi thành 1 module tái sử dụng (DRY). Xoá khỏi:
   - `camera.js`: `openFocusJpeg/closeFocusJpeg/consumeFocusFrame` + `openCardJpeg/closeCardJpeg/consumeFrame` + các field `ws/pendingFrame/decoding/animFrame` trong `focusRuntime`/`local`.
   - `views/parking.js`: `makeLotJpeg`.
   - Kết quả: ~120 dòng lặp → 1 module ~85 dòng; camera.js/parking.js gọn hơn hẳn.
2. **Dọn import thừa**: bỏ `wsCameraUrl` khỏi camera.js & parking.js (giờ chỉ jpeg-stream.js dùng).
3. **Helper chip dùng chung** `setStreamStatusChip` + `STREAM_STATUS_LABELS` ở ui.js (trước có 1
   bản cục bộ trong camera.js).

## Bug tìm được khi test (đã sửa)
- **MediaMTX replace path sai HTTP method**: `PATCH` → đúng là `POST /v3/config/paths/replace`.
  Lộ khi backend restart mà MediaMTX còn giữ path cũ với URL đã đổi. Verify: trước fix source
  không đổi; sau fix đổi đúng.

## Tối ưu kèm theo (nhẹ khi nhiều cam / chống trễ)
- Frontend `IntersectionObserver`: chỉ stream card trong viewport.
- Backend: bỏ infer thread khi `enable_inference=false`; nới nhịp idle encode 0.05→0.2s.
- WebRTC: `playoutDelayHint=0` + `jitterBufferTarget=0`, nhận video-only.

## Nguyên tắc giữ khi mở rộng sau này
- Thêm loại nguồn/hành vi hiển thị → sửa **`stream.js`** (điểm điều phối) + `jpeg-stream.js`/`webrtc.js`, KHÔNG lặp lại ở từng consumer.
- Consumer (card/focus/lot) chỉ nên: cấp element (video/canvas/placeholder), show/hide, `onMode`. Không tự viết logic WS/decode.
- Mọi thay đổi backend streaming phải giữ **latest-wins** (không thêm hàng đợi phình) và **on-demand** (không chạy capture/encode khi không có người xem & AI tắt).

## Verify sau refactor (không crash prod)
- `node --check` toàn bộ JS: pass. Không còn tham chiếu hàm cũ.
- Rebuild Docker: FE serve đúng bản mới (`jpeg-stream.js` 200, `createJpegCanvasPlayer` xuất hiện).
- Smoke test API: 200/204/400/401/404/422 đúng kỳ vọng, **không 500**.
- WS JPEG end-to-end: nhận frame JPEG hợp lệ.
- restart count backend/frontend = 0; không traceback (chỉ lỗi RFID USB do thiếu phần cứng — xử lý mềm).
