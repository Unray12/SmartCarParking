from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.schema import (
    ChangePasswordRequest,
    LoginRequest,
    MeResponse,
    OkResponse,
    ResetPasswordRequest,
    TokenResponse,
)
from app.modules.auth.security import create_access_token
from app.modules.auth.service import authenticate, change_password, reset_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login_endpoint(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = authenticate(db, payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Sai tài khoản hoặc mật khẩu")
    token, expires_in = create_access_token(user.username)
    return TokenResponse(access_token=token, expires_in=expires_in, username=user.username)


@router.get("/me", response_model=MeResponse)
def me_endpoint(username: str = Depends(get_current_user)) -> MeResponse:
    return MeResponse(username=username)


@router.post("/change-password", response_model=OkResponse)
def change_password_endpoint(
    payload: ChangePasswordRequest,
    username: str = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OkResponse:
    ok = change_password(db, username, payload.old_password, payload.new_password)
    if not ok:
        raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không đúng")
    return OkResponse(message="Đổi mật khẩu thành công")


@router.post("/reset-password", response_model=OkResponse)
def reset_password_endpoint(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> OkResponse:
    # Public: reset không điều kiện (placeholder cho OTP email).
    ok = reset_password(db, payload.username, payload.new_password)
    if not ok:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")
    return OkResponse(message="Đặt lại mật khẩu thành công")
