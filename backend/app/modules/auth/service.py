from __future__ import annotations

import hmac

from app.core.config import Settings


def verify_login(username: str, password: str, settings: Settings) -> bool:
    expected_user = settings.admin_username.strip()
    expected_pass = settings.admin_password
    return hmac.compare_digest(username, expected_user) and hmac.compare_digest(password, expected_pass)
