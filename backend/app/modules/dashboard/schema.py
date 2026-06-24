from __future__ import annotations

from pydantic import BaseModel


class DashboardSummaryOut(BaseModel):
    cameras_total: int
    cameras_enabled: int
    active_sessions: int
    today_checkins: int
    today_checkouts: int
    # Sức chứa & doanh thu hôm nay
    total_capacity: int = 0
    total_occupied: int = 0
    occupancy_rate: float = 0.0
    today_revenue: int = 0
    currency: str = ""


class DailyPoint(BaseModel):
    date: str
    checkins: int
    checkouts: int


class StatsOut(BaseModel):
    days: int
    daily: list[DailyPoint]
    by_hour: list[int]            # 24 phần tử: lượt vào theo giờ trong ngày
    avg_duration_minutes: int
    total_revenue: int
    total_sessions: int
    currency: str
