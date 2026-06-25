from __future__ import annotations

from fastapi import Depends, HTTPException, status
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
