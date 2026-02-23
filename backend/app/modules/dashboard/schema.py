from __future__ import annotations

from pydantic import BaseModel


class DashboardSummaryOut(BaseModel):
    cameras_total: int
    cameras_enabled: int
    active_sessions: int
    today_checkins: int
    today_checkouts: int
