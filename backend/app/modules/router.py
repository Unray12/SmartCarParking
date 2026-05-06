from __future__ import annotations

from fastapi import APIRouter

from app.modules.ai.controller import router as ai_router
from app.modules.auth.controller import router as auth_router
from app.modules.cameras.controller import router as cameras_router
from app.modules.dashboard.controller import router as dashboard_router
from app.modules.logs.controller import router as logs_router
from app.modules.plates.controller import router as plates_router
from app.modules.rfid.controller import router as rfid_router
from app.modules.sessions.controller import router as sessions_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(cameras_router)
api_router.include_router(plates_router)
api_router.include_router(sessions_router)
api_router.include_router(dashboard_router)
api_router.include_router(logs_router)
api_router.include_router(rfid_router)
api_router.include_router(ai_router)
