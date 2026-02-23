from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ParkingSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    plate: str
    rfid_card: str
    entry_time: datetime
    exit_time: datetime | None
    status: str
    entry_camera_id: int | None
