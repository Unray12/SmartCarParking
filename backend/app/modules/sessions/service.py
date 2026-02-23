from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.sessions.model import ParkingSession


def list_sessions(db: Session, active_only: bool = False, limit: int = 100) -> list[ParkingSession]:
    safe_limit = max(1, min(limit, 500))

    stmt = select(ParkingSession)
    if active_only:
        stmt = stmt.where(ParkingSession.exit_time.is_(None))
    stmt = stmt.order_by(ParkingSession.entry_time.desc()).limit(safe_limit)

    return db.scalars(stmt).all()
