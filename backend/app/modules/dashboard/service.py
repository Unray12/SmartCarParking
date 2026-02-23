from __future__ import annotations

from datetime import datetime

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.modules.cameras.model import Camera
from app.modules.dashboard.schema import DashboardSummaryOut
from app.modules.sessions.model import ParkingSession


def dashboard_summary(db: Session) -> DashboardSummaryOut:
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)

    cameras_total = db.scalar(select(func.count(Camera.id))) or 0
    cameras_enabled = db.scalar(select(func.count(Camera.id)).where(Camera.enabled.is_(True))) or 0
    active_sessions = db.scalar(select(func.count(ParkingSession.id)).where(ParkingSession.exit_time.is_(None))) or 0
    today_checkins = db.scalar(select(func.count(ParkingSession.id)).where(ParkingSession.entry_time >= today_start)) or 0
    today_checkouts = (
        db.scalar(
            select(func.count(ParkingSession.id)).where(
                and_(ParkingSession.exit_time.is_not(None), ParkingSession.exit_time >= today_start)
            )
        )
        or 0
    )

    return DashboardSummaryOut(
        cameras_total=int(cameras_total),
        cameras_enabled=int(cameras_enabled),
        active_sessions=int(active_sessions),
        today_checkins=int(today_checkins),
        today_checkouts=int(today_checkouts),
    )
