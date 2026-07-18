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
    # Cổng USB/COM đầu đọc RFID riêng cho bãi này (vd /dev/ttyACM0). None/rỗng = không
    # có đầu đọc riêng, fallback cổng mặc định trong .env.
    rfid_usb_port: str | None = Field(default=None, max_length=64)


class ParkingLotUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    capacity: int | None = Field(default=None, ge=0, le=100000)
    entry_camera_id: int | None = None
    exit_camera_id: int | None = None
    is_active: bool | None = None
    ai_enabled: bool | None = None
    rfid_usb_port: str | None = Field(default=None, max_length=64)


class ParkingLotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    capacity: int = 0
    entry_camera_id: int | None
    exit_camera_id: int | None
    is_active: bool
    ai_enabled: bool = False
    rfid_usb_port: str | None = None
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
    ai_exit_plate: str | None = None


class RejectedRfidEventOut(BaseModel):
    """Lượt quẹt thẻ BỊ TỪ CHỐI (already_in/not_found) tại bãi này - không tạo
    ParkingSession nên không nằm trong `sessions`/`snapshots` ở trên, phải lấy riêng từ
    RfidEvent để trang "Chi tiết bãi xe" hiển thị được (chip vàng, phân biệt với xanh =
    thành công, đỏ = đang không quét)."""

    card_id: str
    direction: str
    result_status: str
    received_at: datetime


class ParkingLotOverviewOut(BaseModel):
    lot: ParkingLotOut
    sessions: list[ParkingSessionBriefOut]
    snapshots: list[SnapshotItemOut]
    rejected_events: list[RejectedRfidEventOut] = []


class LotCaptureStatusOut(BaseModel):
    """Phiên bản NHẸ của overview - chỉ đủ dữ liệu cho 2 ô capture + chip trạng thái ở
    trang "Chi tiết bãi xe", để FE poll tần suất CAO (gần realtime) mà không phải tính lại
    occupancy/log/AI toggle như `/overview` (nặng hơn, giữ nhịp poll chậm hơn như cũ)."""

    latest_in: SnapshotItemOut | None = None
    latest_out: SnapshotItemOut | None = None
    paired_in_for_out: SnapshotItemOut | None = None
    rejected_in: RejectedRfidEventOut | None = None
    rejected_out: RejectedRfidEventOut | None = None
