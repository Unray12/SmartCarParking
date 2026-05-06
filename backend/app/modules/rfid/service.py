from __future__ import annotations

import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
from sqlalchemy import and_, desc, select
from sqlalchemy.orm import Session

from app.modules.cameras.model import Camera
from app.core.config import get_settings
from app.modules.plates.model import PlateRead
from app.modules.parking_lots.model import ParkingLot
from app.modules.rfid.model import RfidCard, RfidEvent
from app.modules.rfid.schema import RfidCardCreate, RfidCardOut, RfidCardUpdate, RfidEventIn, RfidEventResult
from app.modules.sessions.model import ParkingSession
from app.services.plate_recognizer import normalize_plate

if TYPE_CHECKING:
    from app.services.camera_stream import CameraStreamManager

settings = get_settings()
NO_PLATE_SENTINEL = "__NONE__"


def _latest_active_session_by_card(db: Session, card_id: str) -> ParkingSession | None:
    return db.scalar(
        select(ParkingSession)
        .where(and_(ParkingSession.rfid_card == card_id, ParkingSession.exit_time.is_(None)))
        .order_by(desc(ParkingSession.entry_time))
        .limit(1)
    )


def _display_plate(value: str | None) -> str | None:
    if not value or value == NO_PLATE_SENTINEL:
        return None
    return value


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


def _resolve_lot(db: Session, lot_id: int | None) -> ParkingLot | None:
    if lot_id is not None:
        return db.get(ParkingLot, lot_id)
    return db.scalar(select(ParkingLot).where(ParkingLot.is_active.is_(True)).order_by(ParkingLot.id.asc()).limit(1))


def _snapshot_root() -> Path:
    root = (Path(__file__).resolve().parents[3] / settings.snapshot_store_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _capture_snapshot(
    db: Session,
    camera_manager: "CameraStreamManager | None",
    camera_id: int | None,
    direction: str,
    card_id: str,
    plate: str,
    occurred_at: datetime,
) -> str | None:
    if not camera_id:
        return None

    frame_bytes: bytes | None = None

    if camera_manager is not None:
        for _ in range(5):
            frame_bytes, _ = camera_manager.get_latest_frame(camera_id)
            if frame_bytes:
                break
            time.sleep(0.08)

    if not frame_bytes:
        camera = db.get(Camera, camera_id)
        source_url = camera.source_url if camera else None
        if source_url:
            cap = cv2.VideoCapture(source_url, cv2.CAP_FFMPEG)
            try:
                ok, frame = cap.read()
                if ok and frame is not None:
                    enc_ok, jpeg = cv2.imencode(".jpg", frame)
                    if enc_ok:
                        frame_bytes = jpeg.tobytes()
            finally:
                cap.release()

    if not frame_bytes:
        print(f"[RFID SNAPSHOT] No frame for camera_id={camera_id}, direction={direction}, card={card_id}")
        return None

    day_folder = occurred_at.strftime("%Y%m%d")
    timestamp = occurred_at.strftime("%Y%m%d_%H%M%S_%f")
    safe_plate = normalize_plate(plate) or "UNKNOWN"
    safe_card = card_id.replace(":", "").replace(" ", "")[:32] or "UNKNOWN"
    filename = f"{direction}_cam{camera_id}_{safe_card}_{safe_plate}_{timestamp}.jpg"

    target_dir = _snapshot_root() / day_folder
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / filename
    target.write_bytes(frame_bytes)
    return str(target)


def _handle_check_in(
    db: Session,
    payload: RfidEventIn,
    occurred_at: datetime,
    lot: ParkingLot | None,
    camera_manager: "CameraStreamManager | None",
) -> RfidEventResult:
    existing_active = _latest_active_session_by_card(db, payload.card_id)
    if existing_active:
        db.commit()
        return RfidEventResult(
            status="already_in",
            message="Card is already assigned to an active parking session",
            session_id=existing_active.id,
            plate=_display_plate(existing_active.plate),
            card_id=payload.card_id,
            lot_id=existing_active.lot_id,
        )

    normalized_plate = normalize_plate(payload.plate) if payload.plate else ""
    chosen_plate_read: PlateRead | None = None

    if not normalized_plate:
        chosen_plate_read = _latest_unlinked_plate(db, occurred_at)
        if chosen_plate_read:
            normalized_plate = chosen_plate_read.plate

    if not normalized_plate:
        normalized_plate = NO_PLATE_SENTINEL

    entry_camera_id = lot.entry_camera_id if lot and lot.entry_camera_id else (chosen_plate_read.camera_id if chosen_plate_read else None)
    entry_snapshot_path = _capture_snapshot(
        db=db,
        camera_manager=camera_manager,
        camera_id=entry_camera_id,
        direction="in",
        card_id=payload.card_id,
        plate=normalized_plate,
        occurred_at=occurred_at,
    )

    session = ParkingSession(
        plate=normalized_plate,
        rfid_card=payload.card_id,
        entry_time=occurred_at,
        status="in",
        lot_id=lot.id if lot else None,
        entry_camera_id=entry_camera_id,
        entry_snapshot_path=entry_snapshot_path,
    )
    db.add(session)

    if chosen_plate_read:
        chosen_plate_read.linked = True
        db.add(chosen_plate_read)

    db.commit()
    db.refresh(session)
    print(f"[RFID EVENT] Car IN: card={payload.card_id}, plate={normalized_plate}")
    return RfidEventResult(
        status="checked_in",
        message="Vehicle checked in successfully",
        session_id=session.id,
        plate=_display_plate(session.plate),
        card_id=payload.card_id,
        lot_id=session.lot_id,
        snapshot_path=session.entry_snapshot_path,
    )


def _handle_check_out(
    db: Session,
    payload: RfidEventIn,
    occurred_at: datetime,
    lot: ParkingLot | None,
    camera_manager: "CameraStreamManager | None",
) -> RfidEventResult:
    active_session = _latest_active_session_by_card(db, payload.card_id)
    if not active_session:
        db.commit()
        return RfidEventResult(
            status="not_found",
            message="No active parking session found for this RFID card",
            card_id=payload.card_id,
            lot_id=lot.id if lot else None,
        )

    if payload.plate and active_session.plate != NO_PLATE_SENTINEL:
        detected_plate = normalize_plate(payload.plate)
        if detected_plate and detected_plate != active_session.plate:
            db.commit()
            return RfidEventResult(
                status="plate_mismatch",
                message="RFID matched but plate does not match entry record",
                session_id=active_session.id,
                plate=_display_plate(active_session.plate),
                card_id=payload.card_id,
                lot_id=active_session.lot_id,
                mismatch=True,
            )

    exit_camera_id = lot.exit_camera_id if lot and lot.exit_camera_id else None
    exit_snapshot_path = _capture_snapshot(
        db=db,
        camera_manager=camera_manager,
        camera_id=exit_camera_id,
        direction="out",
        card_id=payload.card_id,
        plate=active_session.plate,
        occurred_at=occurred_at,
    )

    active_session.exit_time = occurred_at
    active_session.status = "out"
    if exit_camera_id:
        active_session.exit_camera_id = exit_camera_id
    if exit_snapshot_path:
        active_session.exit_snapshot_path = exit_snapshot_path
    db.add(active_session)
    db.commit()

    print(f"[RFID EVENT] Car OUT: card={payload.card_id}, plate={active_session.plate}")

    return RfidEventResult(
        status="checked_out",
        message="Vehicle checked out successfully",
        session_id=active_session.id,
        plate=_display_plate(active_session.plate),
        card_id=payload.card_id,
        lot_id=active_session.lot_id,
        snapshot_path=active_session.exit_snapshot_path,
    )


def ingest_rfid_event(
    db: Session,
    payload: RfidEventIn,
    camera_manager: "CameraStreamManager | None" = None,
) -> RfidEventResult:
    occurred_at = payload.occurred_at or datetime.utcnow()
    _persist_event(db, payload, occurred_at)
    lot = _resolve_lot(db, payload.lot_id)

    if payload.direction == "in":
        return _handle_check_in(db, payload, occurred_at, lot=lot, camera_manager=camera_manager)

    return _handle_check_out(db, payload, occurred_at, lot=lot, camera_manager=camera_manager)


# ---- RfidCard CRUD ----
def list_rfid_cards(db: Session) -> list[RfidCard]:
    return db.scalars(select(RfidCard).order_by(RfidCard.id.desc())).all()


def get_rfid_card(db: Session, card_id: str) -> RfidCard | None:
    return db.scalar(select(RfidCard).where(RfidCard.card_id == card_id))


def create_rfid_card(db: Session, payload: RfidCardCreate) -> RfidCard:
    card = RfidCard(
        card_id=payload.card_id,
        plate=payload.plate,
        owner_name=payload.owner_name,
        is_active=True,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


def update_rfid_card(db: Session, card_id: str, payload: RfidCardUpdate) -> RfidCard | None:
    card = get_rfid_card(db, card_id)
    if not card:
        return None
    if payload.plate is not None:
        card.plate = payload.plate
    if payload.owner_name is not None:
        card.owner_name = payload.owner_name
    if payload.is_active is not None:
        card.is_active = payload.is_active
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


def delete_rfid_card(db: Session, card_id: str) -> bool:
    card = get_rfid_card(db, card_id)
    if not card:
        return False
    db.delete(card)
    db.commit()
    return True


def find_plate_by_card(card_id: str) -> str | None:
    from app.database.session import SessionLocal

    with SessionLocal() as db:
        card = get_rfid_card(db, card_id)
        if card and card.is_active:
            return card.plate
    return None
