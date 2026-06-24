from __future__ import annotations

import hashlib
import hmac
import secrets

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.database.base import utcnow
from app.modules.auth.model import AdminUser

_ALGO = "pbkdf2_sha256"
_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return f"{_ALGO}${_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, hash_hex = stored.split("$")
        if algo != _ALGO:
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


def ensure_admin_seed(db: Session, settings: Settings | None = None) -> None:
    """Tạo tài khoản admin mặc định (admin/admin) nếu chưa có user nào."""
    settings = settings or get_settings()
    count = db.scalar(select(func.count(AdminUser.id))) or 0
    if count:
        return
    username = (settings.admin_username or "admin").strip() or "admin"
    password = settings.admin_password or "admin"
    db.add(AdminUser(username=username, password_hash=hash_password(password)))
    db.commit()
    print(f"[AUTH] Seeded default admin user: {username}")


def get_user(db: Session, username: str) -> AdminUser | None:
    return db.scalar(select(AdminUser).where(AdminUser.username == username))


def authenticate(db: Session, username: str, password: str) -> AdminUser | None:
    user = get_user(db, username)
    if user and verify_password(password, user.password_hash):
        return user
    return None


def change_password(db: Session, username: str, old_password: str, new_password: str) -> bool:
    user = get_user(db, username)
    if not user or not verify_password(old_password, user.password_hash):
        return False
    user.password_hash = hash_password(new_password)
    user.updated_at = utcnow()
    db.add(user)
    db.commit()
    return True


def reset_password(db: Session, username: str, new_password: str) -> bool:
    """Reset không điều kiện (sẽ thay bằng OTP qua email sau)."""
    user = get_user(db, username)
    if not user:
        return False
    user.password_hash = hash_password(new_password)
    user.updated_at = utcnow()
    db.add(user)
    db.commit()
    return True
