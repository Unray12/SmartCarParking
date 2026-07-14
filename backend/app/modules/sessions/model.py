from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, utcnow


class ParkingSession(Base):
    __tablename__ = "parking_sessions"
    # Index phục vụ truy vấn occupancy (đếm xe đang gửi theo bãi) chạy mỗi lần poll.
    __table_args__ = (Index("ix_sessions_lot_exit", "lot_id", "exit_time"),)

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
    # Phí chốt khi xe ra (lưu lại để lịch sử không đổi dù cấu hình giá thay đổi sau này).
    fee: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Số phút gửi chốt khi xe ra (snapshot tại thời điểm check-out).
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Kết quả so khớp biển số AI lúc check-out với biển số lúc vào: None = chưa
    # kiểm tra (bãi không bật AI, hoặc AI không đọc được biển lúc ra), True/False = có kiểm tra.
    # KHÔNG chặn check-out dù mismatch - chỉ đánh dấu để xem lại (theo yêu cầu người dùng).
    ai_plate_match: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
