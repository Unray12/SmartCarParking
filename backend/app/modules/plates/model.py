from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, utcnow


class PlateRead(Base):
    __tablename__ = "plate_reads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    camera_id: Mapped[int] = mapped_column(ForeignKey("cameras.id"), index=True, nullable=False)
    plate: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True, nullable=False)
    linked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    snapshot_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
