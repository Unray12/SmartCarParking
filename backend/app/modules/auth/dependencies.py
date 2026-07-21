from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.modules.auth.security import decode_token

# auto_error=False để tự kiểm soát thông điệp 401.
_bearer = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Chưa đăng nhập hoặc token không hợp lệ",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> str:
    """Dependency dùng để bảo vệ route — trả username từ JWT, hoặc raise 401."""
    if credentials is None or not credentials.credentials:
        raise _UNAUTHORIZED
    payload = decode_token(credentials.credentials)
    if not payload or not payload.get("sub"):
        raise _UNAUTHORIZED
    return payload["sub"]


def get_snapshot_access(
    folder: str,
    filename: str,
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    """Bảo vệ GET /snapshots/files/{folder}/{filename}. <img src> không gắn được header
    Authorization nên token phải đi qua query string - nhưng KHÔNG dùng thẳng JWT đăng
    nhập ở đó (7 ngày, toàn quyền API): URL ảnh dễ lộ qua log truy cập/lịch sử trình
    duyệt/chia sẻ màn hình hơn 1 header, lộ JWT đăng nhập = lộ toàn quyền tài khoản 7
    ngày, không chỉ lộ 1 tấm ảnh. Ở đây CHỈ chấp nhận:
    1) Header Bearer với JWT đăng nhập bình thường (gọi trực tiếp qua API/Postman, không
       qua <img>) - giữ được như cũ cho các use-case đó.
    2) Query ?token= với token snapshot RIÊNG (create_snapshot_token) khoá cứng vào đúng
       path đang xin - claim "path" phải khớp CHÍNH XÁC {folder}/{filename}, nên lộ 1 URL
       ảnh chỉ lộ đúng 1 ảnh đó, trong thời hạn ngắn (settings.snapshot_token_ttl_seconds),
       không đoán/dùng lại được cho ảnh khác hay endpoint khác."""
    if credentials and credentials.credentials:
        payload = decode_token(credentials.credentials)
        if payload and payload.get("sub"):
            return
        raise _UNAUTHORIZED

    token = request.query_params.get("token")
    if not token:
        raise _UNAUTHORIZED
    payload = decode_token(token)
    if not payload or payload.get("scope") != "snapshot" or payload.get("path") != f"{folder}/{filename}":
        raise _UNAUTHORIZED
