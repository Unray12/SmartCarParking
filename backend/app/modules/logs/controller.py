from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.logs.service import get_recent_logs

router = APIRouter(tags=["logs"])


@router.get("/api/logs")
def list_logs(limit: int = 50, hours: int = 24, db: Session = Depends(get_db)) -> list[dict]:
    safe_limit = max(1, min(limit, 500))
    safe_hours = max(1, min(hours, 168))
    logs = get_recent_logs(db, limit=safe_limit, hours=safe_hours)
    return [log.to_dict() for log in logs]
