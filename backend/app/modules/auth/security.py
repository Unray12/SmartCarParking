from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import get_settings

settings = get_settings()


def create_access_token(username: str) -> tuple[str, int]:
    """Trả (token, expires_in_seconds)."""
    expires_in = settings.jwt_expire_minutes * 60
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, expires_in


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except Exception:
        return None


def create_snapshot_token(path: str, ttl_seconds: int) -> str:
    """Token ngắn hạn CHỈ mở được đúng 1 file snapshot (claim "path"), không có "sub" nên
    không dùng được như JWT đăng nhập (get_current_user đòi "sub"). Dùng để nhúng sẵn vào
    image_url trả về từ API, thay cho việc gắn thẳng JWT đăng nhập lên URL ảnh - xem
    get_snapshot_access (auth/dependencies.py) và Settings.snapshot_token_ttl_seconds."""
    now = datetime.now(timezone.utc)
    payload = {
        "scope": "snapshot",
        "path": path,
        "iat": now,
        "exp": now + timedelta(seconds=ttl_seconds),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
