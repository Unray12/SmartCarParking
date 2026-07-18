from __future__ import annotations

from fastapi import Request

from app.services.camera_stream import CameraStreamManager
from app.services.rfid_usb_reader import RfidReaderManager


def get_camera_manager(request: Request) -> CameraStreamManager:
    return request.app.state.camera_manager


def get_rfid_reader_manager(request: Request) -> RfidReaderManager:
    return request.app.state.rfid_reader_manager
