from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.cameras.model import Camera
from app.modules.plates.model import PlateRead
from app.modules.plates.schema import PlateReadOut


def list_recent_plate_reads(db: Session, limit: int = 30) -> list[PlateReadOut]:
    safe_limit = max(1, min(limit, 200))

    stmt = (
        select(PlateRead, Camera.name)
        .join(Camera, Camera.id == PlateRead.camera_id)
        .order_by(PlateRead.seen_at.desc())
        .limit(safe_limit)
    )
    rows = db.execute(stmt).all()

    result: list[PlateReadOut] = []
    for plate_read, camera_name in rows:
        result.append(
            PlateReadOut(
                id=plate_read.id,
                camera_id=plate_read.camera_id,
                camera_name=camera_name,
                plate=plate_read.plate,
                confidence=plate_read.confidence,
                seen_at=plate_read.seen_at,
                linked=plate_read.linked,
            )
        )
    return result
