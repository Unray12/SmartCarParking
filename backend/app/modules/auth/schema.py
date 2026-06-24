from __future__ import annotations

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=255)


class LoginResponse(BaseModel):
    ok: bool = True
    username: str


class ChangePasswordRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    old_password: str = Field(min_length=1, max_length=255)
    new_password: str = Field(min_length=1, max_length=255)


class ResetPasswordRequest(BaseModel):
    # Reset không điều kiện (chưa cần OTP/email) — sẽ siết lại sau.
    username: str = Field(min_length=1, max_length=64)
    new_password: str = Field(min_length=1, max_length=255)


class OkResponse(BaseModel):
    ok: bool = True
    message: str = ""
