from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.dependencies import get_camera_manager
from app.modules.rfid.schema import RfidCardCreate, RfidCardOut, RfidCardUpdate, RfidEventIn, RfidEventResult
from app.modules.rfid.service import (
    create_rfid_card,
    delete_rfid_card,
    get_rfid_card,
    list_rfid_cards,
    ingest_rfid_event,
    update_rfid_card,
)
from app.services.camera_stream import CameraStreamManager

router = APIRouter(tags=["rfid"])


@router.post("/api/rfid/events", response_model=RfidEventResult)
def ingest_rfid_event_endpoint(
    payload: RfidEventIn,
    db: Session = Depends(get_db),
    camera_manager: CameraStreamManager = Depends(get_camera_manager),
) -> RfidEventResult:
    return ingest_rfid_event(db, payload, camera_manager=camera_manager)


@router.get("/api/rfid/cards", response_model=list[RfidCardOut])
def list_cards_endpoint(db: Session = Depends(get_db)) -> list[RfidCardOut]:
    return [RfidCardOut.model_validate(c) for c in list_rfid_cards(db)]


@router.post("/api/rfid/cards", response_model=RfidCardOut)
def create_card_endpoint(payload: RfidCardCreate, db: Session = Depends(get_db)) -> RfidCardOut:
    existing = get_rfid_card(db, payload.card_id)
    if existing:
        raise HTTPException(status_code=400, detail="Card ID already exists")
    card = create_rfid_card(db, payload)
    return RfidCardOut.model_validate(card)


@router.put("/api/rfid/cards/{card_id}", response_model=RfidCardOut)
def update_card_endpoint(card_id: str, payload: RfidCardUpdate, db: Session = Depends(get_db)) -> RfidCardOut:
    card = update_rfid_card(db, card_id, payload)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return RfidCardOut.model_validate(card)


@router.delete("/api/rfid/cards/{card_id}")
def delete_card_endpoint(card_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    ok = delete_rfid_card(db, card_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Card not found")
    return {"ok": True}
