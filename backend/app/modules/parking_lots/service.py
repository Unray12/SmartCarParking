from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.auth.security import create_snapshot_token
from app.modules.parking_lots.model import ParkingLot
from app.modules.parking_lots.schema import ParkingLotCreate, ParkingLotUpdate, SnapshotItemOut, ParkingSessionBriefOut, ParkingLotOverviewOut, ParkingLotOut, RejectedRfidEventOut, LotCaptureStatusOut
from app.modules.rfid.model import RfidEvent
from app.modules.sessions.model import ParkingSession

if TYPE_CHECKING:
    from app.services.rfid_usb_reader import RfidReaderManager

NO_PLATE_SENTINEL = "__NONE__"

# Trạng thái quẹt thẻ BỊ TỪ CHỐI - không tạo ParkingSession (xem
# rfid/service.py:_handle_check_in/_handle_check_out) nên phải lấy riêng từ RfidEvent.
REJECTED_RFID_STATUSES = ("already_in", "not_found")


def list_parking_lots(db: Session) -> list[ParkingLot]:
    return db.scalars(select(ParkingLot).order_by(ParkingLot.id.asc())).all()


def _active_count_by_lot(db: Session) -> dict[int, int]:
    rows = db.execute(
        select(ParkingSession.lot_id, func.count(ParkingSession.id))
        .where(ParkingSession.exit_time.is_(None))
        .group_by(ParkingSession.lot_id)
    ).all()
    return {lot_id: int(count) for lot_id, count in rows if lot_id is not None}


def lot_to_out(lot: ParkingLot, occupied: int | None = None) -> ParkingLotOut:
    out = ParkingLotOut.model_validate(lot)
    if occupied is not None:
        out.occupied = occupied
        out.available = max(0, (lot.capacity or 0) - occupied)
    return out


def list_parking_lots_with_occupancy(db: Session) -> list[ParkingLotOut]:
    lots = list_parking_lots(db)
    counts = _active_count_by_lot(db)
    return [lot_to_out(lot, counts.get(lot.id, 0)) for lot in lots]


def get_parking_lot(db: Session, lot_id: int) -> ParkingLot | None:
    return db.get(ParkingLot, lot_id)


def create_parking_lot(
    db: Session,
    payload: ParkingLotCreate,
    rfid_reader_manager: "RfidReaderManager | None" = None,
) -> ParkingLot:
    existing = db.scalar(select(ParkingLot).where(ParkingLot.name == payload.name.strip()))
    if existing:
        raise HTTPException(status_code=400, detail="Parking lot name already exists")

    lot = ParkingLot(
        name=payload.name.strip(),
        capacity=payload.capacity,
        entry_camera_id=payload.entry_camera_id,
        exit_camera_id=payload.exit_camera_id,
        ai_enabled=payload.ai_enabled,
        rfid_usb_port=(payload.rfid_usb_port or "").strip() or None,
    )
    db.add(lot)
    db.commit()
    db.refresh(lot)
    if rfid_reader_manager is not None:
        rfid_reader_manager.upsert_lot(lot)
    return lot


def update_parking_lot(
    db: Session,
    lot_id: int,
    payload: ParkingLotUpdate,
    rfid_reader_manager: "RfidReaderManager | None" = None,
) -> ParkingLot | None:
    lot = get_parking_lot(db, lot_id)
    if not lot:
        return None

    if payload.name is not None:
        cleaned = payload.name.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="Name must not be empty")
        existing = db.scalar(select(ParkingLot).where(ParkingLot.name == cleaned, ParkingLot.id != lot_id))
        if existing:
            raise HTTPException(status_code=400, detail="Parking lot name already exists")
        lot.name = cleaned

    if payload.capacity is not None:
        lot.capacity = payload.capacity
    lot.entry_camera_id = payload.entry_camera_id
    lot.exit_camera_id = payload.exit_camera_id
    if payload.ai_enabled is not None:
        lot.ai_enabled = payload.ai_enabled
    lot.rfid_usb_port = (payload.rfid_usb_port or "").strip() or None

    db.add(lot)
    db.commit()
    db.refresh(lot)
    if rfid_reader_manager is not None:
        rfid_reader_manager.upsert_lot(lot)
    return lot


def delete_parking_lot(
    db: Session,
    lot_id: int,
    rfid_reader_manager: "RfidReaderManager | None" = None,
    force: bool = False,
) -> bool:
    lot = get_parking_lot(db, lot_id)
    if not lot:
        return False

    # Phiên gửi xe là lịch sử/doanh thu đã CHỐT (immutable). force=False (mặc định): còn
    # phiên nào (đang gửi hay đã ra) -> 409 kèm số liệu cụ thể, để FE hỏi lại bằng popup
    # "còn xe/lịch sử, bạn có chắc chắn muốn xóa?" - người dùng có thể Cancel hoặc xác nhận
    # xóa (force=True). Quyết định người dùng (2026-07-21): xóa bãi KHÔNG xóa log - chỉ
    # ngắt liên kết lot_id (NULL) trên ParkingSession/RfidEvent, giữ nguyên toàn bộ dữ liệu.
    total_sessions = db.scalar(
        select(func.count(ParkingSession.id)).where(ParkingSession.lot_id == lot_id)
    ) or 0
    if total_sessions and not force:
        active_sessions = db.scalar(
            select(func.count(ParkingSession.id)).where(
                ParkingSession.lot_id == lot_id, ParkingSession.exit_time.is_(None)
            )
        ) or 0
        if active_sessions:
            detail = (
                f"Bãi xe còn {active_sessions} xe đang gửi và tổng {total_sessions} phiên "
                "lịch sử."
            )
        else:
            detail = f"Bãi xe còn {total_sessions} phiên lịch sử gửi xe."
        raise HTTPException(status_code=409, detail=f"{detail} Bạn có chắc chắn muốn xóa?")

    # Không xóa cứng ParkingSession/RfidEvent - chỉ ngắt liên kết lot_id về NULL để GIỮ LẠI
    # log (vẫn xem được ở History/Logs, chỉ mất thông tin "thuộc bãi nào").
    db.execute(update(ParkingSession).where(ParkingSession.lot_id == lot_id).values(lot_id=None))
    db.execute(update(RfidEvent).where(RfidEvent.lot_id == lot_id).values(lot_id=None))

    db.delete(lot)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Bãi xe còn dữ liệu liên quan, không thể xóa.")
    if rfid_reader_manager is not None:
        rfid_reader_manager.remove_lot(lot_id)
    return True


def resolve_snapshot_path_to_url(absolute_or_relative_path: str) -> str:
    p = Path(absolute_or_relative_path)
    filename = p.name
    parent = p.parent.name
    # Token nhúng sẵn ở đây (khoá cứng vào đúng path này, ngắn hạn) thay vì để frontend tự
    # gắn JWT đăng nhập lên URL ảnh - xem get_snapshot_access + Settings.snapshot_token_ttl_seconds.
    token = create_snapshot_token(f"{parent}/{filename}", get_settings().snapshot_token_ttl_seconds)
    return f"/api/v1/snapshots/files/{parent}/{filename}?token={token}"


def _session_entry_snapshot_item(s: ParkingSession) -> SnapshotItemOut | None:
    if not s.entry_snapshot_path:
        return None
    plate_value = None if s.plate == NO_PLATE_SENTINEL else s.plate
    return SnapshotItemOut(
        session_id=s.id,
        lot_id=s.lot_id,
        plate=plate_value,
        rfid_card=s.rfid_card,
        direction="in",
        camera_id=s.entry_camera_id,
        timestamp=s.entry_time,
        image_path=s.entry_snapshot_path,
        image_url=resolve_snapshot_path_to_url(s.entry_snapshot_path),
    )


def _session_exit_snapshot_item(s: ParkingSession) -> SnapshotItemOut | None:
    if not s.exit_snapshot_path or not s.exit_time:
        return None
    plate_value = None if s.plate == NO_PLATE_SENTINEL else s.plate
    return SnapshotItemOut(
        session_id=s.id,
        lot_id=s.lot_id,
        plate=plate_value,
        rfid_card=s.rfid_card,
        direction="out",
        camera_id=s.exit_camera_id,
        timestamp=s.exit_time,
        image_path=s.exit_snapshot_path,
        image_url=resolve_snapshot_path_to_url(s.exit_snapshot_path),
    )


def list_snapshot_items(db: Session, lot_id: int | None, limit: int = 100) -> list[SnapshotItemOut]:
    safe_limit = max(1, min(limit, 500))
    stmt = select(ParkingSession).order_by(ParkingSession.entry_time.desc()).limit(safe_limit)
    if lot_id is not None:
        stmt = select(ParkingSession).where(ParkingSession.lot_id == lot_id).order_by(ParkingSession.entry_time.desc()).limit(safe_limit)

    rows = db.scalars(stmt).all()
    output: list[SnapshotItemOut] = []

    for s in rows:
        entry_item = _session_entry_snapshot_item(s)
        if entry_item:
            output.append(entry_item)
        exit_item = _session_exit_snapshot_item(s)
        if exit_item:
            output.append(exit_item)

    output.sort(key=lambda x: x.timestamp, reverse=True)
    return output[:safe_limit]


def _map_plate(plate: str | None) -> str | None:
    if not plate or plate == NO_PLATE_SENTINEL:
        return None
    return plate


def get_parking_lot_overview(db: Session, lot_id: int, limit: int = 100) -> ParkingLotOverviewOut | None:
    lot = get_parking_lot(db, lot_id)
    if not lot:
        return None

    safe_limit = max(1, min(limit, 500))
    sessions = db.scalars(
        select(ParkingSession)
        .where(ParkingSession.lot_id == lot_id)
        .order_by(ParkingSession.entry_time.desc())
        .limit(safe_limit)
    ).all()

    mapped_sessions = [
        ParkingSessionBriefOut(
            session_id=s.id,
            lot_id=s.lot_id,
            plate=_map_plate(s.plate),
            rfid_card=s.rfid_card,
            entry_time=s.entry_time,
            exit_time=s.exit_time,
            status=s.status,
            entry_camera_id=s.entry_camera_id,
            exit_camera_id=s.exit_camera_id,
            entry_snapshot_path=s.entry_snapshot_path,
            exit_snapshot_path=s.exit_snapshot_path,
            ai_plate_match=s.ai_plate_match,
            ai_exit_plate=s.ai_exit_plate,
        )
        for s in sessions
    ]

    snapshots = list_snapshot_items(db, lot_id=lot_id, limit=safe_limit)

    occupied = db.scalar(
        select(func.count(ParkingSession.id)).where(
            ParkingSession.lot_id == lot_id, ParkingSession.exit_time.is_(None)
        )
    ) or 0

    rejected_rows = db.scalars(
        select(RfidEvent)
        .where(RfidEvent.lot_id == lot_id, RfidEvent.result_status.in_(REJECTED_RFID_STATUSES))
        .order_by(RfidEvent.received_at.desc())
        .limit(20)
    ).all()
    rejected_events = [_rejected_event_out(e) for e in rejected_rows]

    return ParkingLotOverviewOut(
        lot=lot_to_out(lot, int(occupied)),
        sessions=mapped_sessions,
        snapshots=snapshots,
        rejected_events=rejected_events,
    )


def _rejected_event_out(e: RfidEvent) -> RejectedRfidEventOut:
    return RejectedRfidEventOut(
        card_id=e.card_id,
        direction=e.direction,
        result_status=e.result_status,
        received_at=e.received_at,
    )


def get_lot_capture_status(db: Session, lot_id: int) -> LotCaptureStatusOut | None:
    """Phiên bản NHẸ của overview - CHỈ phục vụ 2 ô capture + chip trạng thái RFID ở
    trang "Chi tiết bãi xe", để FE poll nhanh hơn (gần realtime) mà không phải tính lại
    occupancy/danh sách session/log - những phần này vẫn giữ nhịp poll chậm hơn qua
    `/overview` như cũ. 4 query LIMIT 1 riêng biệt, rẻ hơn nhiều so với kéo cả 100 session
    + 20 rfid_event rồi lọc ở FE (cách cũ)."""
    lot = get_parking_lot(db, lot_id)
    if not lot:
        return None

    latest_in_session = db.scalar(
        select(ParkingSession)
        .where(ParkingSession.lot_id == lot_id, ParkingSession.entry_snapshot_path.isnot(None))
        .order_by(ParkingSession.entry_time.desc())
        .limit(1)
    )
    latest_out_session = db.scalar(
        select(ParkingSession)
        .where(
            ParkingSession.lot_id == lot_id,
            ParkingSession.exit_time.isnot(None),
            ParkingSession.exit_snapshot_path.isnot(None),
        )
        .order_by(ParkingSession.exit_time.desc())
        .limit(1)
    )

    rejected_in = db.scalar(
        select(RfidEvent)
        .where(RfidEvent.lot_id == lot_id, RfidEvent.direction == "in", RfidEvent.result_status.in_(REJECTED_RFID_STATUSES))
        .order_by(RfidEvent.received_at.desc())
        .limit(1)
    )
    rejected_out = db.scalar(
        select(RfidEvent)
        .where(RfidEvent.lot_id == lot_id, RfidEvent.direction == "out", RfidEvent.result_status.in_(REJECTED_RFID_STATUSES))
        .order_by(RfidEvent.received_at.desc())
        .limit(1)
    )

    return LotCaptureStatusOut(
        latest_in=_session_entry_snapshot_item(latest_in_session) if latest_in_session else None,
        latest_out=_session_exit_snapshot_item(latest_out_session) if latest_out_session else None,
        # Ảnh vào của ĐÚNG phiên vừa ra - lấy từ CÙNG 1 row `latest_out_session`, không
        # phải query riêng (session ra nào cũng có sẵn field entry_snapshot_path của
        # chính nó).
        paired_in_for_out=_session_entry_snapshot_item(latest_out_session) if latest_out_session else None,
        rejected_in=_rejected_event_out(rejected_in) if rejected_in else None,
        rejected_out=_rejected_event_out(rejected_out) if rejected_out else None,
    )
