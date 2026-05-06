from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ParkingLotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    entry_camera_id: int | None = None
    exit_camera_id: int | None = None
    is_active: bool = True


class ParkingLotUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    entry_camera_id: int | None = None
    exit_camera_id: int | None = None
    is_active: bool | None = None


class ParkingLotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    entry_camera_id: int | None
    exit_camera_id: int | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


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


class ParkingLotOverviewOut(BaseModel):
    lot: ParkingLotOut
    sessions: list[ParkingSessionBriefOut]
    snapshots: list[SnapshotItemOut]
