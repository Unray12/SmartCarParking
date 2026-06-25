from __future__ import annotations

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=255)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    username: str


class MeResponse(BaseModel):
    username: str


class ChangePasswordRequest(BaseModel):
    # username lấy từ token (người đang đăng nhập), không nhận từ body.
    old_password: str = Field(min_length=1, max_length=255)
    new_password: str = Field(min_length=1, max_length=255)


class ResetPasswordRequest(BaseModel):
    # Reset không điều kiện (chưa cần OTP/email) — public.
    username: str = Field(min_length=1, max_length=64)
    new_password: str = Field(min_length=1, max_length=255)


class OkResponse(BaseModel):
    ok: bool = True
    message: str = ""
