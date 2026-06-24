from __future__ import annotations

import math
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.sessions.model import ParkingSession
from app.modules.sessions.schema import ParkingSessionOut

settings = get_settings()
NO_PLATE_SENTINEL = "__NONE__"


def compute_duration_minutes(entry_time: datetime, end_time: datetime | None) -> int:
    end = end_time or datetime.utcnow()
    delta = (end - entry_time).total_seconds() / 60.0
    return max(0, int(round(delta)))


def compute_fee(entry_time: datetime, end_time: datetime | None) -> int:
    """Phí = base + số block (sau khi trừ phút miễn phí) * giá mỗi block."""
    minutes = compute_duration_minutes(entry_time, end_time)
    billable = max(0, minutes - settings.parking_free_minutes)
    if billable <= 0:
        return settings.parking_fee_base
    block = max(1, settings.parking_fee_block_minutes)
    blocks = math.ceil(billable / block)
    return settings.parking_fee_base + blocks * settings.parking_fee_per_block


def _to_out(s: ParkingSession) -> ParkingSessionOut:
    # Xe đã ra: dùng phí/thời gian đã chốt trong DB (nếu có). Xe đang gửi: tính ước lượng theo hiện tại.
    if s.exit_time is not None and s.fee is not None:
        fee = s.fee
        duration = s.duration_minutes if s.duration_minutes is not None else compute_duration_minutes(s.entry_time, s.exit_time)
    else:
        duration = compute_duration_minutes(s.entry_time, s.exit_time)
        fee = compute_fee(s.entry_time, s.exit_time)
    return ParkingSessionOut(
        id=s.id,
        plate=None if s.plate == NO_PLATE_SENTINEL else s.plate,
        rfid_card=s.rfid_card,
        entry_time=s.entry_time,
        exit_time=s.exit_time,
        status=s.status,
        lot_id=s.lot_id,
        entry_camera_id=s.entry_camera_id,
        exit_camera_id=s.exit_camera_id,
        entry_snapshot_path=s.entry_snapshot_path,
        exit_snapshot_path=s.exit_snapshot_path,
        duration_minutes=duration,
        fee=fee,
        currency=settings.parking_currency,
    )


def list_sessions(db: Session, active_only: bool = False, limit: int = 100) -> list[ParkingSessionOut]:
    safe_limit = max(1, min(limit, 500))

    stmt = select(ParkingSession)
    if active_only:
        stmt = stmt.where(ParkingSession.exit_time.is_(None))
    stmt = stmt.order_by(ParkingSession.entry_time.desc()).limit(safe_limit)

    return [_to_out(s) for s in db.scalars(stmt).all()]
