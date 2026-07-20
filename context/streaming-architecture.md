# 01 — Kiến trúc stream camera (WebRTC + JPEG hybrid)

## Mục tiêu
Độ trễ thấp nhất, không delay tích luỹ, nhẹ khi nhiều camera — nhưng vẫn hỗ trợ mọi loại nguồn.

## Chọn đường theo loại nguồn
| Nguồn camera | Đường hiển thị | Lý do |
|---|---|---|
| `rtsp://` (IP camera thật) | **WebRTC** qua MediaMTX | Không re-encode, browser decode HW, không FIFO → không trễ tích luỹ |
| `http://` MJPEG | **JPEG-over-WebSocket** | MediaMTX không ingest được MJPEG |

Frontend gọi `GET /api/v1/cameras/{id}/webrtc` → `{ available, path, public_base }`.
`available=true` chỉ khi: `STREAM_WEBRTC_ENABLED` bật **và** nguồn `rtsp://` **và** camera đang bật.
- `available=true` → **thuần WebRTC** (lỗi thì retry WebRTC, KHÔNG rơi JPEG).
- `available=false` → **JPEG-over-WS**.

## Sơ đồ

```text
 Camera RTSP/H.264 ─┐
                    │   ┌──────────── Docker network ────────────┐
                    └──►│ MediaMTX                                │
                        │  • ingest RTSP → repackage (no re-encode)│
                        │  • WHEP/WebRTC :8889 (signaling)         │
                        │  • ICE/UDP     :8189 (media)             │
                        │  • RTSP re-pub :8554 (nội bộ)            │
                        │  • Control API :9997 (chỉ backend)       │
                        │  • authMethod http → backend            │
                        └──┬─────────────┬──────────────┬─────────┘
              WebRTC(H264) │   RTSP re-pub│   Control API│ auth
                           ▼             ▼              ▼
                     Browser <video>  AI worker     backend
                     (WHEP client)   (nhận diện)   (quản lý path, xác thực)

 Camera HTTP/MJPEG ─► backend CameraWorker (OpenCV) ─JPEG/WS─► Browser <canvas>
```

## Vì sao không có delay tích luỹ
Nguyên tắc **latest-wins** ở mọi tầng (không FIFO phình):
- WebRTC: không hàng đợi; browser đặt `playoutDelayHint=0` + `jitterBufferTarget=0` (jitter buffer tối thiểu); nhận **video-only** (bỏ audio để không đồng bộ A/V gây trễ).
- JPEG: capture→encode→WS→browser đều giữ frame mới nhất theo `seq`; browser `pendingFrame` ghi đè (không push); + periodic reconnect 30' xả buffer OpenCV.
- AI: queue `maxsize=1` drain-refill.
- MediaMTX kéo mỗi nguồn **1 lần**, fan-out cho N viewer → thêm người xem không tăng tải camera.

## Xác thực
MediaMTX gọi `POST /api/v1/streaming/mediamtx-auth` trước mỗi hành động; backend cho phép nếu
token trong query là **JWT hợp lệ** (browser) hoặc **token nội bộ** `STREAM_INTERNAL_TOKEN`
(AI/re-publish). Action `api/metrics` cho qua (cổng 9997 không expose ra host); `publish` bị chặn.

## Cổng
- Expose host: backend `8010`, frontend `5173`, MediaMTX WebRTC `8889` + UDP `8189`.
- Chỉ nội bộ docker: Control API `9997`, RTSP `8554`.

## Biến môi trường (xem `.env` / `mediamtx.yml` / `docker-compose.yml`)
```env
STREAM_WEBRTC_ENABLED=true
MEDIAMTX_API_URL=http://mediamtx:9997
MEDIAMTX_RTSP_BASE=rtsp://mediamtx:8554
MEDIAMTX_WEBRTC_PUBLIC_BASE=          # trống: FE tự suy host:8889
MEDIAMTX_WEBRTC_HOST=192.168.1.7,127.0.0.1   # IP LAN thật cho ICE (nhiều IP: dấu phẩy)
STREAM_INTERNAL_TOKEN=<đổi ở prod>
```

## Tối ưu độ trễ đã áp
- Camera (khuyến nghị): Profile Low (Baseline, không B-frame), GOP ngắn, Smoothing 0-1, CBR.
- Backend `max_delay=10ms`, `nobuffer`, `low_delay` — **chỉ ảnh hưởng đường JPEG/AI** (MediaMTX kéo RTSP bằng cấu hình riêng của nó, không đọc các option này).
- Frontend: `playoutDelayHint=0`, video-only, `IntersectionObserver` chỉ stream card đang thấy.
