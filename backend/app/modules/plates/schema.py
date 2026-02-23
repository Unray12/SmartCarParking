from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class PlateReadOut(BaseModel):
    id: int
    camera_id: int
    camera_name: str
    plate: str
    confidence: float | None
    seen_at: datetime
    linked: bool
