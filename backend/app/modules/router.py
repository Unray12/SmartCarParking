from __future__ import annotations

from fastapi import APIRouter, Depends

from app.modules.ai.controller import router as ai_router
from app.modules.auth.controller import router as auth_router
from app.modules.auth.dependencies import get_current_user
from app.modules.cameras.controller import router as cameras_router
from app.modules.cameras.controller import ws_router as cameras_ws_router
from app.modules.dashboard.controller import router as dashboard_router
from app.modules.logs.controller import router as logs_router
from app.modules.parking_lots.controller import files_router as snapshot_files_router
from app.modules.parking_lots.controller import router as parking_lots_router
from app.modules.plates.controller import router as plates_router
from app.modules.rfid.controller import router as rfid_router
from app.modules.sessions.controller import router as sessions_router
from app.modules.streaming.controller import router as streaming_router

# Dependency bảo vệ toàn bộ API nghiệp vụ bằng JWT Bearer token.
_auth = [Depends(get_current_user)]

# Nhóm /api/v1
api_v1 = APIRouter(prefix="/api/v1")

# Public (không cần Bearer token qua router, nhưng KHÔNG có nghĩa mở hoàn toàn - xem
# comment trong từng controller: /auth/login có rate-limit, /auth/reset-password vừa
# rate-limit vừa chặn theo IP nội bộ, /auth/me & /auth/change-password tự bảo vệ bằng
# get_current_user, snapshot files bảo vệ bằng get_current_user_flexible (?token=)).
api_v1.include_router(auth_router)
api_v1.include_router(snapshot_files_router)  # serve ảnh (img/<a> không gửi được header)
# MediaMTX gọi server-to-server để xác thực read/publish - tự bảo vệ bằng token trong query
# (JWT hợp lệ hoặc token nội bộ), không gắn được Bearer nên để ngoài nhóm _auth.
api_v1.include_router(streaming_router)

# Protected (yêu cầu Bearer token)
api_v1.include_router(cameras_router, dependencies=_auth)
api_v1.include_router(plates_router, dependencies=_auth)
api_v1.include_router(sessions_router, dependencies=_auth)
api_v1.include_router(dashboard_router, dependencies=_auth)
api_v1.include_router(logs_router, dependencies=_auth)
api_v1.include_router(parking_lots_router, dependencies=_auth)
api_v1.include_router(rfid_router, dependencies=_auth)
api_v1.include_router(ai_router, dependencies=_auth)

# Router gốc: /api/v1 + WebSocket (mở, không token, không version prefix)
api_router = APIRouter()
api_router.include_router(api_v1)
api_router.include_router(cameras_ws_router)
