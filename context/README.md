# Context — SmartCarParking (tài liệu chi tiết theo chủ đề)

Toàn bộ logic & kiến trúc hệ thống nằm trong thư mục này, chia nhỏ theo chủ đề để dễ đọc/review.
File [`../CONTEXT.md`](../CONTEXT.md) ngoài chỉ là hướng dẫn cơ bản + trỏ vào đây.

## Bắt đầu ở đâu
- Chưa quen hệ thống → đọc [overview.md](overview.md) (logic cốt lõi, phải đọc trước).
- Cần sửa/thêm code, không biết mở file nào → [code-map.md](code-map.md).

## Danh mục
| File | Nội dung |
|---|---|
| [overview.md](overview.md) | Logic cốt lõi (ĐỌC TRƯỚC), tổng quan, luồng nghiệp vụ end-to-end, gotchas |
| [code-map.md](code-map.md) | **Bản đồ file**: tra theo triệu chứng, vai trò từng file, luồng xuyên file |
| [backend.md](backend.md) | Data model, init_db/migration, lifecycle, config, recognizer, API modules |
| [rfid.md](rfid.md) | Đọc RFID (USB/nhiều đầu đọc) + logic check-in/out (nghiệp vụ trung tâm) |
| [frontend.md](frontend.md) | SPA vanilla JS: IA, module, điều phối, camera/parking/ai |
| [streaming-architecture.md](streaming-architecture.md) | Stream WebRTC + JPEG hybrid, MediaMTX, chống trễ tích luỹ, on-demand |
| [testing-notes.md](testing-notes.md) | Cách test trên Docker, lệnh kiểm thử, các bẫy (Windows path, camera down) |
| [changelog.md](changelog.md) | Nhật ký thay đổi (mới nhất ở trên) + đánh giá clean-code |

> Cập nhật gần nhất: 2026-07-19.
