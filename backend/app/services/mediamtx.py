from __future__ import annotations

import json
import urllib.error
import urllib.request

# Client tối giản cho MediaMTX Control API (v3) - chỉ dùng stdlib urllib để KHÔNG kéo thêm
# dependency (httpx/requests) vào image vốn đã nặng vì opencv/onnxruntime trên NUC. Các lời
# gọi ở đây thưa (chỉ khi camera được bật/tắt/xoá) nên chạy đồng bộ, đơn giản là đủ.
#
# Backend là bên DUY NHẤT quản lý path của MediaMTX: mỗi camera RTSP <-> 1 path tên cam<id>,
# source trỏ thẳng URL RTSP của camera, sourceOnDemand=yes để MediaMTX chỉ nối camera khi có
# người đọc (browser WebRTC hoặc AI worker) - camera vì thế chỉ chịu đúng 1 kết nối.


class MediaMTXClient:
    def __init__(self, api_url: str, timeout: float = 4.0) -> None:
        # Bỏ dấu "/" cuối để ghép path cho gọn.
        self._base = api_url.rstrip("/")
        self._timeout = timeout

    @staticmethod
    def path_name(camera_id: int) -> str:
        return f"cam{camera_id}"

    def _request(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict | None]:
        url = f"{self._base}{path}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                raw = resp.read()
                parsed = json.loads(raw) if raw else None
                return resp.status, parsed
        except urllib.error.HTTPError as exc:
            # 400 khi add path đã tồn tại / xoá path không tồn tại - caller tự xử lý.
            return exc.code, None
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            # MediaMTX chưa sẵn sàng / không kết nối được - không được làm sập luồng camera.
            print(f"[MEDIAMTX] {method} {path} lỗi kết nối: {exc}")
            return 0, None

    def upsert_camera_path(self, camera_id: int, rtsp_url: str) -> bool:
        """Tạo/cập nhật path cam<id> trỏ tới RTSP camera. Idempotent: nếu đã tồn tại thì
        replace để URL luôn khớp với DB (camera có thể được sửa source_url)."""
        name = self.path_name(camera_id)
        conf = {
            "source": rtsp_url,
            # Chỉ kết nối camera khi có reader -> camera chịu tối đa 1 kết nối, và tự ngắt
            # khi không ai xem (tiết kiệm băng thông/CPU trên NUC).
            "sourceOnDemand": True,
            # Ép TCP cho ổn định (khớp cấu hình phía backend & Docker Desktop/Windows).
            "rtspTransport": "tcp",
        }
        # /add sẽ 400 nếu path đã có -> fallback sang /replace để cập nhật cấu hình.
        status, _ = self._request("POST", f"/v3/config/paths/add/{name}", conf)
        if status in (200, 201):
            return True
        status, _ = self._request("PATCH", f"/v3/config/paths/replace/{name}", conf)
        return status in (200, 201)

    def remove_camera_path(self, camera_id: int) -> bool:
        name = self.path_name(camera_id)
        status, _ = self._request("DELETE", f"/v3/config/paths/delete/{name}")
        # 200 = xoá được, 404/400 = vốn không tồn tại -> coi như đã sạch.
        return status in (200, 201, 404, 400)
