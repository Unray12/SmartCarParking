from __future__ import annotations

from fastapi import Request

from app.services.camera_stream import CameraStreamManager


def get_camera_manager(request: Request) -> CameraStreamManager:
    return request.app.state.camera_manager
