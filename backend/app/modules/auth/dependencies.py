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


def get_current_user_flexible(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """Giống get_current_user, nhưng CHỈ dùng cho các endpoint mà trình duyệt không thể
    tự gắn header Authorization: ảnh snapshot tải qua <img src> và không có nơi nào khác
    cho việc này ngoài query string. Chấp nhận header Bearer NẾU có, không thì fallback
    sang query param ?token=. Không dùng cho endpoint JSON API thường (luôn ưu tiên header)."""
    token = credentials.credentials if credentials and credentials.credentials else request.query_params.get("token")
    if not token:
        raise _UNAUTHORIZED
    payload = decode_token(token)
    if not payload or not payload.get("sub"):
        raise _UNAUTHORIZED
    return payload["sub"]
