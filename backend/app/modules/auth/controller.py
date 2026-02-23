from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import Settings, get_settings
from app.modules.auth.schema import LoginRequest, LoginResponse
from app.modules.auth.service import verify_login

router = APIRouter(tags=["auth"])


@router.post("/api/auth/login", response_model=LoginResponse)
def login_endpoint(payload: LoginRequest, settings: Settings = Depends(get_settings)) -> LoginResponse:
    if not verify_login(payload.username, payload.password, settings):
        raise HTTPException(status_code=401, detail="Sai tài khoản hoặc mật khẩu")
    return LoginResponse(username=settings.admin_username)
