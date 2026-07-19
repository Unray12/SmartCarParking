# 05 — Ghi chú kiểm thử (Docker)

## Khởi động
```bash
docker compose up -d --build          # db + mediamtx + backend + frontend
docker compose ps                     # tất cả Up; db healthy
docker compose logs backend --tail=5  # "Application startup complete"
```
Chỉ rebuild phần đổi: `docker compose up -d --build backend frontend`.

## Smoke test API (không crash dù lỗi)
Đăng nhập lấy token rồi gọi các endpoint, kiểm mã trả:
```bash
B=http://localhost:8010
TOKEN=$(curl -s -X POST $B/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s -o /dev/null -w '%{http_code}\n' $B/api/v1/cameras -H "Authorization: Bearer $TOKEN"   # 200
curl -s $B/api/v1/cameras/1/webrtc -H "Authorization: Bearer $TOKEN"                            # available?
```
Kỳ vọng: auth 200/401; camera CRUD 200; nguồn sai 400; JSON hỏng 422; thiếu tài nguyên 404;
mediamtx-auth 204/401. **Không được có 500.**

## Kiểm tra không crash-restart
```bash
docker inspect smartcarparking-backend-1 --format '{{.RestartCount}}'   # phải 0
docker compose logs backend --since=10m | grep -iE "traceback|500 internal"   # trống
```
Lỗi `RFID USB ... could not open port` là bình thường khi không cắm phần cứng — đã xử lý mềm.

## Kiểm tra MediaMTX path (Control API chỉ nội bộ)
MediaMTX image không có curl/wget → gọi qua backend container:
```bash
docker compose exec -T backend python -c "import urllib.request,json;print(json.load(urllib.request.urlopen('http://mediamtx:9997/v3/config/paths/list',timeout=4)))"
```

## Test đường JPEG end-to-end (khi không có camera thật)
Dựng nguồn MJPEG giả trong container rồi kết nối WS. **BẮT BUỘC `MSYS_NO_PATHCONV=1`** trên
Windows Git Bash (nếu không, đường `/...` bị chuyển thành path Windows → file not found), và
chạy server **inline `python -c`** hoặc background (đừng dùng file `/tmp/...`):
```bash
# server MJPEG (chạy nền), rồi:
docker compose exec -T backend python -c "
import asyncio,websockets
async def m():
  async with websockets.connect('ws://localhost:8010/ws/cameras/<ID>?token=<TOKEN>',max_size=None) as ws:
    d=await asyncio.wait_for(ws.recv(),timeout=15); print(len(d), d[:3].hex())  # ffd8ff = JPEG
asyncio.run(m())"
```

## Bẫy đã gặp
- **Git Bash mangle path**: `/tmp/x.py` → `C:/Users/.../x.py` khi truyền vào `docker exec`. Dùng
  `MSYS_NO_PATHCONV=1` hoặc `python -c` inline.
- **Camera HTTP (IP Webcam) down** → WS timeout là do nguồn tắt, không phải app lỗi. Kiểm reachability:
  `docker compose exec -T backend python -c "import urllib.request;print(urllib.request.urlopen('http://<ip>:<port>/videofeed',timeout=5).headers)"`.
- **WebRTC media** cần browser thật + camera RTSP thật để xác nhận (không test headless được);
  đã xác nhận chạy qua ảnh chụp thực tế trước đó.

## Frontend: đảm bảo serve đúng bản mới (skill vanilla-js)
```bash
diff <(curl -s http://localhost:5173/js/stream.js) frontend/renderer/js/stream.js
```
Khác nhau → rebuild/restart container, không phải lỗi logic.
