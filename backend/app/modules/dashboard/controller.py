from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.dashboard.schema import DashboardSummaryOut
from app.modules.dashboard.service import dashboard_summary

router = APIRouter(tags=["dashboard"])


@router.get("/api/dashboard/summary", response_model=DashboardSummaryOut)
def dashboard_summary_endpoint(db: Session = Depends(get_db)) -> DashboardSummaryOut:
    return dashboard_summary(db)
