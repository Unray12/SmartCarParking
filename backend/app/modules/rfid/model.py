from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, utcnow


class RfidEvent(Base):
    __tablename__ = "rfid_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    card_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    source: Mapped[str] = mapped_column(String(64), default="http", nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True, nullable=False)
    payload_json: Mapped[str | None] = mapped_column(String, nullable=True)


class RfidCard(Base):
    __tablename__ = "rfid_cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    card_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    plate: Mapped[str] = mapped_column(String(32), nullable=False)
    owner_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
