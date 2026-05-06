from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, utcnow


class ParkingSession(Base):
    __tablename__ = "parking_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    plate: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    rfid_card: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    entry_time: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True, nullable=False)
    exit_time: Mapped[datetime | None] = mapped_column(DateTime, index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="in", nullable=False)
    lot_id: Mapped[int | None] = mapped_column(ForeignKey("parking_lots.id"), nullable=True)
    entry_camera_id: Mapped[int | None] = mapped_column(ForeignKey("cameras.id"), nullable=True)
    exit_camera_id: Mapped[int | None] = mapped_column(ForeignKey("cameras.id"), nullable=True)
    entry_snapshot_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    exit_snapshot_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
