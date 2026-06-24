from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.auth.schema import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    OkResponse,
    ResetPasswordRequest,
)
from app.modules.auth.service import authenticate, change_password, reset_password

router = APIRouter(tags=["auth"])


@router.post("/api/auth/login", response_model=LoginResponse)
def login_endpoint(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = authenticate(db, payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Sai tài khoản hoặc mật khẩu")
    return LoginResponse(username=user.username)


@router.post("/api/auth/change-password", response_model=OkResponse)
def change_password_endpoint(payload: ChangePasswordRequest, db: Session = Depends(get_db)) -> OkResponse:
    ok = change_password(db, payload.username, payload.old_password, payload.new_password)
    if not ok:
        raise HTTPException(status_code=400, detail="Sai tài khoản hoặc mật khẩu hiện tại")
    return OkResponse(message="Đổi mật khẩu thành công")


@router.post("/api/auth/reset-password", response_model=OkResponse)
def reset_password_endpoint(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> OkResponse:
    ok = reset_password(db, payload.username, payload.new_password)
    if not ok:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")
    return OkResponse(message="Đặt lại mật khẩu thành công")
