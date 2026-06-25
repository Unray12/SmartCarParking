from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.plates.schema import PlateReadOut
from app.modules.plates.service import list_recent_plate_reads

router = APIRouter(prefix="/plates", tags=["plates"])


@router.get("", response_model=list[PlateReadOut])
def recent_plates_endpoint(limit: int = 30, db: Session = Depends(get_db)) -> list[PlateReadOut]:
    return list_recent_plate_reads(db, limit)
