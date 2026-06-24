from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.dashboard.schema import DashboardSummaryOut, StatsOut
from app.modules.dashboard.service import dashboard_stats, dashboard_summary

router = APIRouter(tags=["dashboard"])


@router.get("/api/dashboard/summary", response_model=DashboardSummaryOut)
def dashboard_summary_endpoint(db: Session = Depends(get_db)) -> DashboardSummaryOut:
    return dashboard_summary(db)


@router.get("/api/dashboard/stats", response_model=StatsOut)
def dashboard_stats_endpoint(days: int = 7, db: Session = Depends(get_db)) -> StatsOut:
    return dashboard_stats(db, days=days)
