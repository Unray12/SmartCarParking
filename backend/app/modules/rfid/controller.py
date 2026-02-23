from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.rfid.schema import RfidEventIn, RfidEventResult
from app.modules.rfid.service import ingest_rfid_event

router = APIRouter(tags=["rfid"])


@router.post("/api/rfid/events", response_model=RfidEventResult)
def ingest_rfid_event_endpoint(payload: RfidEventIn, db: Session = Depends(get_db)) -> RfidEventResult:
    return ingest_rfid_event(db, payload)
