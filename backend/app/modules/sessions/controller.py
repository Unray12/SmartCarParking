from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.sessions.schema import ParkingSessionOut
from app.modules.sessions.service import list_sessions

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=list[ParkingSessionOut])
def list_sessions_endpoint(
    active_only: bool = False,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> list[ParkingSessionOut]:
    return list_sessions(db, active_only=active_only, limit=limit)
