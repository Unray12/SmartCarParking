from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.dependencies import get_camera_manager
from app.modules.cameras.schema import CameraCreate, CameraOut, CameraToggleRequest, CameraUpdateRequest
from app.modules.cameras.service import (
    create_camera,
    delete_camera,
    list_cameras,
    toggle_camera,
    update_camera,
)
from app.services.camera_stream import CameraStreamManager

router = APIRouter(tags=["cameras"])


@router.get("/api/cameras", response_model=list[CameraOut])
def list_camera_endpoint(db: Session = Depends(get_db)) -> list[CameraOut]:
    return list_cameras(db)


@router.post("/api/cameras", response_model=CameraOut)
def create_camera_endpoint(
    payload: CameraCreate,
    db: Session = Depends(get_db),
    camera_manager: CameraStreamManager = Depends(get_camera_manager),
) -> CameraOut:
    return create_camera(db, payload, camera_manager)


@router.patch("/api/cameras/{camera_id}", response_model=CameraOut)
def toggle_camera_endpoint(
    camera_id: int,
    payload: CameraToggleRequest,
    db: Session = Depends(get_db),
    camera_manager: CameraStreamManager = Depends(get_camera_manager),
) -> CameraOut:
    return toggle_camera(db, camera_id, payload.enabled, camera_manager)


@router.delete("/api/cameras/{camera_id}")
def delete_camera_endpoint(
    camera_id: int,
    db: Session = Depends(get_db),
    camera_manager: CameraStreamManager = Depends(get_camera_manager),
) -> dict[str, bool]:
    return delete_camera(db, camera_id, camera_manager)


@router.put("/api/cameras/{camera_id}", response_model=CameraOut)
def update_camera_endpoint(
    camera_id: int,
    payload: CameraUpdateRequest,
    db: Session = Depends(get_db),
    camera_manager: CameraStreamManager = Depends(get_camera_manager),
) -> CameraOut:
    return update_camera(db, camera_id, payload, camera_manager)


@router.websocket("/ws/cameras/{camera_id}")
async def ws_camera_stream(websocket: WebSocket, camera_id: int) -> None:
    await websocket.accept()
    camera_manager: CameraStreamManager = websocket.app.state.camera_manager
    ws_target_fps = int(getattr(websocket.app.state, "stream_ws_target_fps", 12))
    last_seq = 0
    last_send_time = 0.0
    min_interval = 1.0 / max(1, ws_target_fps)

    try:
        while True:
            now = asyncio.get_event_loop().time()
            if now - last_send_time >= min_interval:
                frame, _, seq = camera_manager.get_latest_packet(camera_id)
                if frame and seq > last_seq:
                    await websocket.send_bytes(frame)
                    last_seq = seq
                    last_send_time = now
            await asyncio.sleep(0.005)
    except WebSocketDisconnect:
        return
