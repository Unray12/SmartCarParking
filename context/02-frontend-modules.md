# 02 — Cấu trúc module frontend

Vanilla ES modules, không framework/bundler. `frontend/renderer/js/`.

## Module liên quan stream (sau refactor)
| File | Trách nhiệm (SRP) |
|---|---|
| `api.js` | fetch wrapper + token; `wsCameraUrl()` (JPEG-WS URL); `buildWhepUrl()` (WHEP URL) |
| `webrtc.js` | WHEP client thuần: RTCPeerConnection nhận-only, POST offer, tối ưu trễ (playoutDelayHint, video-only) |
| `jpeg-stream.js` | **[MỚI]** `createJpegCanvasPlayer()` — JPEG-over-WS → canvas, latest-wins, tự reconnect. Dùng CHUNG |
| `stream.js` | `createStreamSession()` — điều phối: chọn WebRTC hay JPEG, retry, phát mode qua `onMode` |
| `ui.js` | `setStreamStatusChip()`, `STREAM_STATUS_LABELS`, `withButtonBusy()`, `notify`, escapeHtml... |
| `camera.js` | card grid + phóng lớn; `IntersectionObserver` chỉ stream card đang thấy |
| `views/parking.js` | chi tiết bãi: 2 stream vào/ra (mỗi hướng 1 session) |

## `createStreamSession` (stream.js) — hợp đồng
```js
createStreamSession({
  cameraId, video, canvas,
  showVideo(), showCanvas(),          // đổi element đang hiện
  startJpeg(),                         // trả { stop } — dùng createJpegCanvasPlayer
  onMode(mode),                        // 'connecting'|'webrtc'|'jpeg'|'error'|null → chip
}) -> { start(), stop() }
```
- rtsp (available) → WebRTC, lỗi/timeout → retry WebRTC (không JPEG).
- non-rtsp → gọi `startJpeg()`.
- `stop()` dừng cả WebRTC lẫn JPEG player.

## `createJpegCanvasPlayer` (jpeg-stream.js) — tái sử dụng
Trước đây logic JPEG→canvas bị **lặp 3 nơi** (card, focus, lot). Nay gộp 1 module:
latest-wins (`pendingFrame` ghi đè), decode qua `requestAnimationFrame` (cờ `decoding`),
tự reconnect khi WS rớt, `onFirstFrame` để ẩn placeholder. Tự chạy khi tạo; `stop()` để dừng.
> Ngoại lệ: `views/ai.js` (AI live test) vẫn có vòng JPEG riêng vì cần vẽ **overlay box** nhận
> diện lên từng frame — khác mục đích, chưa gộp.

## Chip trạng thái luồng
Hiển thị trên **header** (không overlay góc video): card (cùng hàng nút Đang bật/tắt), phóng lớn
(cạnh nút Fullscreen), chi tiết bãi (cạnh "Live cam vào/ra"). Màu: 🔵 connecting / 🟢 webrtc /
🟡 jpeg / 🔴 error. Helper chung `setStreamStatusChip(el, mode)` + CSS `.stream-status.mode-*`.

## Giữ phiên điều hướng (session persistence)
`state.js`: `loadNav()/saveNav()` lưu `localStorage['scp_nav_v1']`.
- Trang đang xem → `saveNav({view})` + đồng bộ **URL hash** (`#parking`). `main.js::getInitialView()`
  đọc hash → localStorage → 'overview'. Nút back/forward qua `hashchange`.
- Camera phóng lớn (`focusedCameraId`) và bãi đang mở (`selectedLotId`) cũng lưu/khôi phục →
  refresh vẫn đúng chỗ. Bãi/camera đã xoá thì tự bỏ chọn (không spam lỗi).

## UX cơ bản đã thêm
- Chống double-submit + nhãn "đang xử lý": `withButtonBusy()` cho form thêm/sửa camera, bãi, upload model.
- Esc đóng modal sửa camera.
- Chỉ stream card trong viewport (nhẹ khi nhiều cam).
