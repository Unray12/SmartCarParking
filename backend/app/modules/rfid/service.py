from __future__ import annotations

import json
from datetime import datetime, timedelta

from sqlalchemy import and_, desc, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.plates.model import PlateRead
from app.modules.rfid.model import RfidEvent
from app.modules.rfid.schema import RfidEventIn, RfidEventResult
from app.modules.sessions.model import ParkingSession
from app.services.plate_recognizer import normalize_plate

settings = get_settings()


def _latest_active_session_by_card(db: Session, card_id: str) -> ParkingSession | None:
    return db.scalar(
        select(ParkingSession)
        .where(and_(ParkingSession.rfid_card == card_id, ParkingSession.exit_time.is_(None)))
        .order_by(desc(ParkingSession.entry_time))
        .limit(1)
    )


def _latest_unlinked_plate(db: Session, occurred_at: datetime) -> PlateRead | None:
    from_time = occurred_at - timedelta(seconds=settings.rfid_link_window_seconds)
    return db.scalar(
        select(PlateRead)
        .where(
            and_(
                PlateRead.linked.is_(False),
                PlateRead.seen_at >= from_time,
                PlateRead.seen_at <= occurred_at,
            )
        )
        .order_by(PlateRead.seen_at.desc())
        .limit(1)
    )


def _persist_event(db: Session, payload: RfidEventIn, occurred_at: datetime) -> None:
    event = RfidEvent(
        card_id=payload.card_id,
        direction=payload.direction,
        source=payload.source,
        received_at=occurred_at,
        payload_json=json.dumps(payload.data, ensure_ascii=False),
    )
    db.add(event)


def _handle_check_in(db: Session, payload: RfidEventIn, occurred_at: datetime) -> RfidEventResult:
    existing_active = _latest_active_session_by_card(db, payload.card_id)
    if existing_active:
        db.commit()
        return RfidEventResult(
            status="already_in",
            message="Card is already assigned to an active parking session",
            session_id=existing_active.id,
            plate=existing_active.plate,
            card_id=payload.card_id,
        )

    normalized_plate = normalize_plate(payload.plate) if payload.plate else ""
    chosen_plate_read: PlateRead | None = None

    if not normalized_plate:
        chosen_plate_read = _latest_unlinked_plate(db, occurred_at)
        if chosen_plate_read:
            normalized_plate = chosen_plate_read.plate

    if not normalized_plate:
        db.commit()
        return RfidEventResult(
            status="waiting_plate",
            message="RFID received but no recent plate read found in link window",
            card_id=payload.card_id,
        )

    session = ParkingSession(
        plate=normalized_plate,
        rfid_card=payload.card_id,
        entry_time=occurred_at,
        status="in",
        entry_camera_id=chosen_plate_read.camera_id if chosen_plate_read else None,
    )
    db.add(session)

    if chosen_plate_read:
        chosen_plate_read.linked = True
        db.add(chosen_plate_read)

    db.commit()
    db.refresh(session)
    return RfidEventResult(
        status="checked_in",
        message="Vehicle checked in successfully",
        session_id=session.id,
        plate=session.plate,
        card_id=payload.card_id,
    )


def _handle_check_out(db: Session, payload: RfidEventIn, occurred_at: datetime) -> RfidEventResult:
    active_session = _latest_active_session_by_card(db, payload.card_id)
    if not active_session:
        db.commit()
        return RfidEventResult(
            status="not_found",
            message="No active parking session found for this RFID card",
            card_id=payload.card_id,
        )

    if payload.plate:
        detected_plate = normalize_plate(payload.plate)
        if detected_plate and detected_plate != active_session.plate:
            db.commit()
            return RfidEventResult(
                status="plate_mismatch",
                message="RFID matched but plate does not match entry record",
                session_id=active_session.id,
                plate=active_session.plate,
                card_id=payload.card_id,
                mismatch=True,
            )

    active_session.exit_time = occurred_at
    active_session.status = "out"
    db.add(active_session)
    db.commit()

    return RfidEventResult(
        status="checked_out",
        message="Vehicle checked out successfully",
        session_id=active_session.id,
        plate=active_session.plate,
        card_id=payload.card_id,
    )


def ingest_rfid_event(db: Session, payload: RfidEventIn) -> RfidEventResult:
    occurred_at = payload.occurred_at or datetime.utcnow()
    _persist_event(db, payload, occurred_at)

    if payload.direction == "in":
        return _handle_check_in(db, payload, occurred_at)

    return _handle_check_out(db, payload, occurred_at)
