from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.cameras.model import Camera
from app.modules.dashboard.schema import DailyPoint, DashboardSummaryOut, StatsOut
from app.modules.parking_lots.model import ParkingLot
from app.modules.sessions.model import ParkingSession
from app.modules.sessions.service import compute_duration_minutes, compute_fee

settings = get_settings()


def _session_fee(s: ParkingSession) -> int:
    """Phí đã chốt nếu có, ngược lại tính lại (cho dữ liệu cũ trước khi lưu fee)."""
    if s.fee is not None:
        return s.fee
    return compute_fee(s.entry_time, s.exit_time)


def _session_duration(s: ParkingSession) -> int:
    if s.duration_minutes is not None:
        return s.duration_minutes
    return compute_duration_minutes(s.entry_time, s.exit_time)


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

    total_capacity = db.scalar(
        select(func.coalesce(func.sum(ParkingLot.capacity), 0)).where(ParkingLot.is_active.is_(True))
    ) or 0
    total_occupied = int(active_sessions)
    occupancy_rate = round((total_occupied / total_capacity) * 100, 1) if total_capacity else 0.0

    # Doanh thu hôm nay: tổng phí đã chốt của các session ra trong ngày (fallback tính lại nếu thiếu).
    today_done = db.scalars(
        select(ParkingSession).where(
            and_(ParkingSession.exit_time.is_not(None), ParkingSession.exit_time >= today_start)
        )
    ).all()
    today_revenue = sum(_session_fee(s) for s in today_done)

    return DashboardSummaryOut(
        cameras_total=int(cameras_total),
        cameras_enabled=int(cameras_enabled),
        active_sessions=int(active_sessions),
        today_checkins=int(today_checkins),
        today_checkouts=int(today_checkouts),
        total_capacity=int(total_capacity),
        total_occupied=total_occupied,
        occupancy_rate=occupancy_rate,
        today_revenue=int(today_revenue),
        currency=settings.parking_currency,
    )


def dashboard_stats(db: Session, days: int = 7) -> StatsOut:
    safe_days = max(1, min(days, 90))
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)
    since = today_start - timedelta(days=safe_days - 1)

    # Khởi tạo các ngày trong khoảng.
    daily_map: dict[str, dict[str, int]] = {}
    for i in range(safe_days):
        day = (since + timedelta(days=i)).strftime("%Y-%m-%d")
        daily_map[day] = {"checkins": 0, "checkouts": 0}

    by_hour = [0] * 24

    # Lấy session liên quan tới khoảng thời gian (vào hoặc ra trong khoảng).
    sessions = db.scalars(
        select(ParkingSession).where(
            (ParkingSession.entry_time >= since) | (ParkingSession.exit_time >= since)
        )
    ).all()

    durations: list[int] = []
    total_revenue = 0
    completed_in_range = 0

    for s in sessions:
        if s.entry_time and s.entry_time >= since:
            key = s.entry_time.strftime("%Y-%m-%d")
            if key in daily_map:
                daily_map[key]["checkins"] += 1
            by_hour[s.entry_time.hour] += 1
        if s.exit_time and s.exit_time >= since:
            key = s.exit_time.strftime("%Y-%m-%d")
            if key in daily_map:
                daily_map[key]["checkouts"] += 1
            durations.append(_session_duration(s))
            total_revenue += _session_fee(s)
            completed_in_range += 1

    avg_duration = int(round(sum(durations) / len(durations))) if durations else 0

    daily = [DailyPoint(date=d, checkins=v["checkins"], checkouts=v["checkouts"]) for d, v in daily_map.items()]

    return StatsOut(
        days=safe_days,
        daily=daily,
        by_hour=by_hour,
        avg_duration_minutes=avg_duration,
        total_revenue=int(total_revenue),
        total_sessions=completed_in_range,
        currency=settings.parking_currency,
    )
