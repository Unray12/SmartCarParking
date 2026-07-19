# Context — SmartCarParking (chi tiết theo chủ đề)

Thư mục này chia nhỏ tài liệu context theo từng chủ đề để dễ đọc/review. File tổng quan
toàn hệ thống vẫn ở `../CONTEXT.md` (nghiệp vụ RFID, DB, auth, API...). Thư mục này tập
trung vào **hệ thống stream camera** và **cấu trúc/chất lượng code frontend** — phần được
làm mới & refactor nhiều nhất gần đây.

| File | Nội dung |
|---|---|
| [01-streaming-architecture.md](01-streaming-architecture.md) | Kiến trúc stream WebRTC + JPEG hybrid, MediaMTX, sơ đồ, luồng dữ liệu |
| [02-frontend-modules.md](02-frontend-modules.md) | Cấu trúc module FE, `stream.js`/`jpeg-stream.js`, giữ phiên, UX |
| [03-backend-streaming.md](03-backend-streaming.md) | `camera_stream.py`, `mediamtx.py`, module `streaming`, on-demand |
| [04-refactor-log.md](04-refactor-log.md) | Nhật ký refactor: đã đổi gì, vì sao, bug tìm được, đánh giá clean-code |
| [05-testing-notes.md](05-testing-notes.md) | Cách test trên Docker, lệnh kiểm thử, các bẫy (Windows path, camera down) |

> Cập nhật gần nhất: 2026-07-19.
