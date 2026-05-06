from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select, union_all
from sqlalchemy.orm import Session

from app.modules.logs.model import LogEntry, LogType
from app.modules.plates.model import PlateRead
from app.modules.rfid.model import RfidEvent
from app.modules.sessions.model import ParkingSession


def get_recent_logs(db: Session, limit: int = 100, hours: int = 24) -> list[LogEntry]:
    since = datetime.utcnow() - timedelta(hours=hours)
    logs: list[LogEntry] = []

    rfid_events = db.scalars(
        select(RfidEvent).where(RfidEvent.received_at >= since).order_by(RfidEvent.received_at.desc()).limit(limit)
    ).all()

    for evt in rfid_events:
        log_type = LogType.RFID_IN if evt.direction == "in" else LogType.RFID_OUT
        logs.append(
            LogEntry(
                timestamp=evt.received_at,
                log_type=log_type,
                message=f"RFID {evt.direction.upper()}: card={evt.card_id}, source={evt.source}",
                details={"card_id": evt.card_id, "direction": evt.direction, "source": evt.source},
            )
        )

    plate_reads = db.scalars(
        select(PlateRead).where(PlateRead.seen_at >= since).order_by(PlateRead.seen_at.desc()).limit(limit)
    ).all()

    for pr in plate_reads:
        conf_text = f"{pr.confidence:.2f}" if pr.confidence is not None else "N/A"
        logs.append(
            LogEntry(
                timestamp=pr.seen_at,
                log_type=LogType.PLATE_READ,
                message=f"Biển số: {pr.plate} (conf={conf_text}) camera_id={pr.camera_id}",
                details={"plate": pr.plate, "confidence": pr.confidence, "camera_id": pr.camera_id, "linked": pr.linked},
            )
        )

    sessions = db.scalars(
        select(ParkingSession).where(ParkingSession.entry_time >= since).order_by(ParkingSession.entry_time.desc()).limit(limit)
    ).all()

    for s in sessions:
        logs.append(
            LogEntry(
                timestamp=s.entry_time,
                log_type=LogType.SESSION_IN,
                message=f"XE VÀO: {s.plate}, RFID={s.rfid_card}",
                details={"session_id": s.id, "plate": s.plate, "rfid_card": s.rfid_card, "camera_id": s.entry_camera_id},
            )
        )
        if s.exit_time:
            logs.append(
                LogEntry(
                    timestamp=s.exit_time,
                    log_type=LogType.SESSION_OUT,
                    message=f"XE RA: {s.plate}, RFID={s.rfid_card}",
                    details={"session_id": s.id, "plate": s.plate, "rfid_card": s.rfid_card},
                )
            )

    logs.sort(key=lambda x: x.timestamp, reverse=True)
    return logs[:limit]
