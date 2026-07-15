from __future__ import annotations

import ipaddress
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
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

# Rate limit chống brute-force cho /login và /reset-password - 2 endpoint duy nhất không
# yêu cầu Bearer token có sẵn. In-memory (đủ dùng vì backend chạy 1 process/instance, xem
# app/database/session.py không có kiến trúc multi-worker) - reset khi restart là chấp
# nhận được, không cần Redis chỉ cho việc này.
_RATE_LIMIT_WINDOW_SECONDS = 60
_RATE_LIMIT_MAX_ATTEMPTS = 8
_attempt_log: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(key: str) -> None:
    now = time.monotonic()
    window_start = now - _RATE_LIMIT_WINDOW_SECONDS
    attempts = [t for t in _attempt_log[key] if t >= window_start]
    if len(attempts) >= _RATE_LIMIT_MAX_ATTEMPTS:
        _attempt_log[key] = attempts
        raise HTTPException(status_code=429, detail="Quá nhiều lần thử, vui lòng thử lại sau ít phút")
    attempts.append(now)
    _attempt_log[key] = attempts


def _is_private_or_loopback(host: str | None) -> bool:
    if not host:
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback


@router.post("/login", response_model=TokenResponse)
def login_endpoint(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(f"login:{client_ip}")
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
def reset_password_endpoint(payload: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)) -> OkResponse:
    # Trước đây endpoint này public HOÀN TOÀN, reset không điều kiện, không xác minh danh
    # tính gì cả -> bất kỳ ai (kể cả qua Internet nếu port có expose) chiếm được quyền admin
    # chỉ bằng cách biết username (mặc định "admin", ghi ngay trong .env.example). Đây là
    # lỗ hổng account-takeover nghiêm trọng nhất tìm thấy trong lượt rà soát bảo mật.
    #
    # Giữ nguyên UX "quên mật khẩu" tự phục vụ ngay ở màn login (chưa có kênh xác minh danh
    # tính thật như OTP email/SMS) nhưng CHỈ cho phép gọi từ mạng nội bộ/localhost - đúng mô
    # hình triển khai thực tế của app (NUC/máy tại chỗ trong LAN bãi xe). Chặn được kịch bản
    # tấn công từ xa qua Internet, không chặn được người trong cùng LAN - khi có kênh OTP
    # email/SMS thật thì bỏ giới hạn IP này và xác minh theo OTP thay vì theo network.
    client_ip = request.client.host if request.client else None
    if not _is_private_or_loopback(client_ip):
        raise HTTPException(status_code=403, detail="Chỉ được đặt lại mật khẩu từ mạng nội bộ")
    _check_rate_limit(f"reset:{client_ip}")

    ok = reset_password(db, payload.username, payload.new_password)
    if not ok:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")
    return OkResponse(message="Đặt lại mật khẩu thành công")
