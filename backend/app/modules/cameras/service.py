from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.cameras.model import Camera
from app.modules.cameras.schema import CameraCreate, CameraOut, CameraUpdateRequest
from app.modules.parking_lots.model import ParkingLot
from app.modules.plates.model import PlateRead
from app.modules.sessions.model import ParkingSession
from app.services.camera_stream import CameraStreamManager


def _get_camera_or_404(db: Session, camera_id: int) -> Camera:
    camera = db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    return camera


def _save_camera(db: Session, camera: Camera) -> Camera:
    db.add(camera)
    db.commit()
    db.refresh(camera)
    return camera


def to_camera_out(camera: Camera) -> CameraOut:
    return CameraOut(
        id=camera.id,
        name=camera.name,
        source_url=camera.source_url,
        enabled=camera.enabled,
        created_at=camera.created_at,
        updated_at=camera.updated_at,
        stream_ws_path=f"/ws/cameras/{camera.id}",
    )


def validate_camera_source(source_url: str) -> None:
    lower = source_url.lower()
    if lower.startswith("rtsp://") or lower.startswith("http://") or lower.startswith("https://"):
        return
    raise HTTPException(status_code=400, detail="Camera source must start with rtsp://, http:// or https://")


def list_cameras(db: Session) -> list[CameraOut]:
    rows = db.scalars(select(Camera).order_by(Camera.id.asc())).all()
    return [to_camera_out(row) for row in rows]


def create_camera(db: Session, payload: CameraCreate, camera_manager: CameraStreamManager) -> CameraOut:
    validate_camera_source(payload.source_url)

    camera = Camera(name=payload.name.strip(), source_url=payload.source_url.strip(), enabled=payload.enabled)
    _save_camera(db, camera)

    camera_manager.upsert_camera(camera)
    return to_camera_out(camera)


def toggle_camera(db: Session, camera_id: int, enabled: bool, camera_manager: CameraStreamManager) -> CameraOut:
    camera = _get_camera_or_404(db, camera_id)

    camera.enabled = enabled
    camera.updated_at = datetime.utcnow()
    _save_camera(db, camera)

    camera_manager.set_enabled(camera.id, camera.enabled)
    return to_camera_out(camera)


def delete_camera(db: Session, camera_id: int, camera_manager: CameraStreamManager) -> dict[str, bool]:
    camera = _get_camera_or_404(db, camera_id)

    # Camera gắn trong phiên gửi xe (ảnh chụp vào/ra) là lịch sử đã CHỐT - CHẶN xóa cứng,
    # hướng dẫn dùng nút Tắt (Camera.enabled=false, đã có sẵn) để ngừng camera mà không mất
    # lịch sử. Cùng nguyên tắc đã áp dụng cho xóa bãi xe (2026-07-21).
    session_refs = db.scalar(
        select(func.count(ParkingSession.id)).where(
            or_(ParkingSession.entry_camera_id == camera_id, ParkingSession.exit_camera_id == camera_id)
        )
    ) or 0
    if session_refs:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Camera còn trong {session_refs} phiên gửi xe (ảnh chụp vào/ra), không thể xóa. "
                "Dùng nút Tắt để ngừng camera mà vẫn giữ lịch sử."
            ),
        )

    # Không còn trong lịch sử phiên -> an toàn dọn: bỏ tham chiếu ở bãi xe (chỉ là CẤU HÌNH
    # hiện tại - camera vào/ra đang gán, không phải lịch sử - bãi vẫn còn, chỉ mất camera đã
    # gán, admin chọn lại camera khác sau) + xóa log nhận diện biển số rời (plate_reads chưa
    # từng gắn vào phiên nào, không phải lịch sử phí/doanh thu).
    db.execute(update(ParkingLot).where(ParkingLot.entry_camera_id == camera_id).values(entry_camera_id=None))
    db.execute(update(ParkingLot).where(ParkingLot.exit_camera_id == camera_id).values(exit_camera_id=None))
    db.execute(delete(PlateRead).where(PlateRead.camera_id == camera_id))

    db.delete(camera)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Camera đang được sử dụng, không thể xóa.")

    camera_manager.remove_camera(camera_id)
    return {"ok": True}


def update_camera(
    db: Session,
    camera_id: int,
    payload: CameraUpdateRequest,
    camera_manager: CameraStreamManager,
) -> CameraOut:
    camera = _get_camera_or_404(db, camera_id)

    validate_camera_source(payload.source_url)

    camera.name = payload.name.strip()
    camera.source_url = payload.source_url.strip()
    if payload.enabled is not None:
        camera.enabled = payload.enabled
    camera.updated_at = datetime.utcnow()

    _save_camera(db, camera)

    camera_manager.upsert_camera(camera)
    return to_camera_out(camera)
