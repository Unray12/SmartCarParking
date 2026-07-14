from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class RfidEventIn(BaseModel):
    card_id: str = Field(min_length=1, max_length=64)
    direction: Literal["in", "out"]
    plate: str | None = Field(default=None, max_length=32)
    source: str = Field(default="http-device", max_length=64)
    lot_id: int | None = None
    occurred_at: datetime | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class RfidEventResult(BaseModel):
    status: str
    message: str
    session_id: int | None = None
    plate: str | None = None
    card_id: str
    lot_id: int | None = None
    snapshot_path: str | None = None
    mismatch: bool = False
    # Kết quả so khớp biển số AI lúc check-out (None = bãi không bật AI hoặc AI
    # không đọc được biển lúc ra). KHÔNG chặn checkout dù False - chỉ để cảnh báo.
    ai_plate_match: bool | None = None
    # Phí gửi xe khi check-out
    fee: int | None = None
    currency: str | None = None
    duration_minutes: int | None = None


class RfidCardCreate(BaseModel):
    card_id: str = Field(min_length=1, max_length=64)
    plate: str = Field(min_length=1, max_length=32)
    owner_name: str | None = Field(default=None, max_length=128)


class RfidCardUpdate(BaseModel):
    plate: str | None = Field(default=None, max_length=32)
    owner_name: str | None = Field(default=None, max_length=128)
    is_active: bool | None = None


class RfidCardOut(BaseModel):
    id: int
    card_id: str
    plate: str
    owner_name: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
