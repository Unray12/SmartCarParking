from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ParkingSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    plate: str | None
    rfid_card: str
    entry_time: datetime
    exit_time: datetime | None
    status: str
    lot_id: int | None
    entry_camera_id: int | None
    exit_camera_id: int | None
    entry_snapshot_path: str | None
    exit_snapshot_path: str | None
    ai_plate_match: bool | None = None
    ai_exit_plate: str | None = None
    # Computed
    duration_minutes: int = 0
    fee: int = 0
    currency: str = ""
