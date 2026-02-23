from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class RfidEventIn(BaseModel):
    card_id: str = Field(min_length=1, max_length=64)
    direction: Literal["in", "out"]
    plate: str | None = Field(default=None, max_length=32)
    source: str = Field(default="http-device", max_length=64)
    occurred_at: datetime | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class RfidEventResult(BaseModel):
    status: str
    message: str
    session_id: int | None = None
    plate: str | None = None
    card_id: str
    mismatch: bool = False
