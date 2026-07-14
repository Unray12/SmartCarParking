from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ParkingLotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    capacity: int = Field(default=50, ge=0, le=100000)
    entry_camera_id: int | None = None
    exit_camera_id: int | None = None
    is_active: bool = True
    ai_enabled: bool = False


class ParkingLotUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    capacity: int | None = Field(default=None, ge=0, le=100000)
    entry_camera_id: int | None = None
    exit_camera_id: int | None = None
    is_active: bool | None = None
    ai_enabled: bool | None = None


class ParkingLotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    capacity: int = 0
    entry_camera_id: int | None
    exit_camera_id: int | None
    is_active: bool
    ai_enabled: bool = False
    created_at: datetime
    updated_at: datetime
    # Computed occupancy (None khi không tính, ví dụ ở create/update response).
    occupied: int | None = None
    available: int | None = None


class SnapshotItemOut(BaseModel):
    session_id: int
    lot_id: int | None
    plate: str | None
    rfid_card: str
    direction: str
    camera_id: int | None
    timestamp: datetime
    image_path: str
    image_url: str


class ParkingSessionBriefOut(BaseModel):
    session_id: int
    lot_id: int | None
    plate: str | None
    rfid_card: str
    entry_time: datetime
    exit_time: datetime | None
    status: str
    entry_camera_id: int | None
    exit_camera_id: int | None
    entry_snapshot_path: str | None
    exit_snapshot_path: str | None
    ai_plate_match: bool | None = None


class ParkingLotOverviewOut(BaseModel):
    lot: ParkingLotOut
    sessions: list[ParkingSessionBriefOut]
    snapshots: list[SnapshotItemOut]
