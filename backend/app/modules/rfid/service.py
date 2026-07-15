from __future__ import annotations

import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
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


def _persist_event(db: Session, payload: RfidEventIn, occurred_at: datetime, result_status: str | None = None) -> None:
    event = RfidEvent(
        card_id=payload.card_id,
        direction=payload.direction,
        source=payload.source,
        received_at=occurred_at,
        payload_json=json.dumps(payload.data, ensure_ascii=False),
        result_status=result_status,
    )
    db.add(event)
    db.commit()


def _detect_plate_via_ai(
    camera_manager: "CameraStreamManager | None",
    camera_id: int | None,
) -> tuple[str | None, float | None, tuple[int, int, int, int] | None, "np.ndarray | None"]:
    """Chạy AI nhận diện NGAY lúc quét RFID (on-demand qua test_camera_ai - dùng frame
    mới nhất camera đang có, không phụ thuộc/không cần bật stream inference nền).
    Chỉ gọi khi bãi có ai_enabled=True. Không raise - lỗi/không đọc được thì trả toàn None.
    Trả kèm box + đúng frame đã chạy detect để vẽ box lên snapshot khớp toạ độ, tránh
    phải chụp lại 1 frame khác lúc lưu ảnh (frame có thể đã đổi, box lệch)."""
    if camera_manager is None or not camera_id:
        return None, None, None, None
    try:
        frame_available, detections, frame_bgr = camera_manager.test_camera_ai(camera_id)
    except Exception:
        return None, None, None, None
    if not frame_available or not detections:
        return None, None, None, None
    best = max(detections, key=lambda d: d.confidence or 0.0)
    plate = normalize_plate(best.plate)
    return (plate or None), best.confidence, best.box, frame_bgr


def _resolve_lot(db: Session, lot_id: int | None) -> ParkingLot | None:
    if lot_id is not None:
        return db.get(ParkingLot, lot_id)
    return db.scalar(select(ParkingLot).where(ParkingLot.is_active.is_(True)).order_by(ParkingLot.id.asc()).limit(1))


def _snapshot_root() -> Path:
    root = (Path(__file__).resolve().parents[3] / settings.snapshot_store_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _draw_plate_box(frame_bgr: "np.ndarray", box: tuple[int, int, int, int], plate: str) -> None:
    """Vẽ khung xanh quanh biển số + chữ biển lên frame (sửa tại chỗ, đã copy trước khi gọi)."""
    x1, y1, x2, y2 = (int(v) for v in box)
    cv2.rectangle(frame_bgr, (x1, y1), (x2, y2), (0, 255, 0), 2)
    label_y = y1 - 8 if y1 - 8 > 10 else y2 + 22
    cv2.putText(frame_bgr, plate, (x1, label_y), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2, cv2.LINE_AA)


def _capture_snapshot(
    db: Session,
    camera_manager: "CameraStreamManager | None",
    camera_id: int | None,
    direction: str,
    card_id: str,
    plate: str,
    occurred_at: datetime,
    ai_frame_bgr: "np.ndarray | None" = None,
    plate_box: tuple[int, int, int, int] | None = None,
) -> str | None:
    if not camera_id:
        return None

    frame_bytes: bytes | None = None

    # Tái dùng đúng frame vừa chạy AI detect (nếu có) - khớp toạ độ box, đỡ 1 lần chụp lại.
    if ai_frame_bgr is not None:
        frame_to_save = ai_frame_bgr.copy() if plate_box is not None else ai_frame_bgr
        if plate_box is not None:
            _draw_plate_box(frame_to_save, plate_box, plate)
        enc_ok, jpeg = cv2.imencode(".jpg", frame_to_save)
        if enc_ok:
            frame_bytes = jpeg.tobytes()

    if not frame_bytes and camera_manager is not None:
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
    entry_camera_id = lot.entry_camera_id if lot and lot.entry_camera_id else None
    ai_box: tuple[int, int, int, int] | None = None
    ai_frame_bgr: np.ndarray | None = None

    # Bãi bật AI + chưa có biển số tường minh -> detect ngay lúc quét (ưu tiên hơn
    # plate_reads nền vì đây là kết quả tươi đúng thời điểm quẹt thẻ). Bãi tắt AI thì
    # bỏ qua hoàn toàn bước này - giữ đúng hành vi cũ (biển số optional, không tự detect).
    if not normalized_plate and lot and lot.ai_enabled:
        ai_plate, _ai_conf, ai_box, ai_frame_bgr = _detect_plate_via_ai(camera_manager, entry_camera_id)
        if ai_plate:
            normalized_plate = ai_plate
        else:
            ai_box, ai_frame_bgr = None, None

    if not normalized_plate:
        chosen_plate_read = _latest_unlinked_plate(db, occurred_at)
        if chosen_plate_read:
            normalized_plate = chosen_plate_read.plate

    if not normalized_plate:
        normalized_plate = NO_PLATE_SENTINEL

    if not entry_camera_id and chosen_plate_read:
        entry_camera_id = chosen_plate_read.camera_id
    entry_snapshot_path = _capture_snapshot(
        db=db,
        camera_manager=camera_manager,
        camera_id=entry_camera_id,
        direction="in",
        card_id=payload.card_id,
        plate=normalized_plate,
        occurred_at=occurred_at,
        ai_frame_bgr=ai_frame_bgr,
        plate_box=ai_box,
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

    # Bãi bật AI -> LUÔN detect lại biển số ở camera cổng RA ngay lúc quét (không chỉ khi
    # đã biết biển từ lúc vào). Nếu lúc vào đã có biển thì so khớp như cũ (CHỦ Ý: không
    # chặn check-out dù lệch, chỉ đánh dấu ai_plate_match=False để xem lại sau - tránh
    # kẹt xe khi AI đọc nhầm). Nếu lúc vào KHÔNG đọc được biển (NO_PLATE_SENTINEL) thì
    # dùng luôn biển đọc được lúc ra để điền vào session - tránh log/hiện thị bị null
    # trong khi AI đã nhận diện được biển số thật.
    ai_plate_match: bool | None = None
    ai_box: tuple[int, int, int, int] | None = None
    ai_frame_bgr: np.ndarray | None = None
    if lot and lot.ai_enabled:
        ai_plate, _ai_conf, ai_box, ai_frame_bgr = _detect_plate_via_ai(camera_manager, exit_camera_id)
        if ai_plate:
            if active_session.plate != NO_PLATE_SENTINEL:
                ai_plate_match = ai_plate == active_session.plate
            else:
                active_session.plate = ai_plate
        else:
            ai_box, ai_frame_bgr = None, None

    exit_snapshot_path = _capture_snapshot(
        db=db,
        camera_manager=camera_manager,
        camera_id=exit_camera_id,
        direction="out",
        card_id=payload.card_id,
        plate=active_session.plate,
        occurred_at=occurred_at,
        ai_frame_bgr=ai_frame_bgr,
        plate_box=ai_box,
    )

    from app.modules.sessions.service import compute_duration_minutes, compute_fee

    # Chốt phí & thời gian gửi tại thời điểm check-out rồi lưu vào DB (immutable).
    duration = compute_duration_minutes(active_session.entry_time, occurred_at)
    fee = compute_fee(active_session.entry_time, occurred_at)

    active_session.exit_time = occurred_at
    active_session.status = "out"
    active_session.duration_minutes = duration
    active_session.fee = fee
    active_session.ai_plate_match = ai_plate_match
    if exit_camera_id:
        active_session.exit_camera_id = exit_camera_id
    if exit_snapshot_path:
        active_session.exit_snapshot_path = exit_snapshot_path
    db.add(active_session)
    db.commit()

    if ai_plate_match is False:
        print(f"[RFID EVENT] AI plate MISMATCH luc check-out: card={payload.card_id}, session_plate={active_session.plate}")
    print(f"[RFID EVENT] Car OUT: card={payload.card_id}, plate={active_session.plate}, fee={fee} ({duration}m)")

    return RfidEventResult(
        status="checked_out",
        message="Vehicle checked out successfully",
        session_id=active_session.id,
        plate=_display_plate(active_session.plate),
        card_id=payload.card_id,
        lot_id=active_session.lot_id,
        snapshot_path=active_session.exit_snapshot_path,
        fee=fee,
        currency=settings.parking_currency,
        duration_minutes=duration,
        ai_plate_match=ai_plate_match,
    )


def ingest_rfid_event(
    db: Session,
    payload: RfidEventIn,
    camera_manager: "CameraStreamManager | None" = None,
) -> RfidEventResult:
    occurred_at = payload.occurred_at or datetime.utcnow()
    lot = _resolve_lot(db, payload.lot_id)

    if payload.direction == "in":
        result = _handle_check_in(db, payload, occurred_at, lot=lot, camera_manager=camera_manager)
    else:
        result = _handle_check_out(db, payload, occurred_at, lot=lot, camera_manager=camera_manager)

    # Lưu event SAU khi đã biết kết quả xử lý - để result_status phản ánh đúng thẻ này
    # bị từ chối (already_in/not_found/plate_mismatch) hay xử lý thành công, giúp UI phân
    # biệt được ngay cả khi xem qua log/poll (không chỉ lúc gọi API trực tiếp mới có status).
    _persist_event(db, payload, occurred_at, result_status=result.status)
    return result


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
