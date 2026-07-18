from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, utcnow


class ParkingLot(Base):
    __tablename__ = "parking_lots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    entry_camera_id: Mapped[int | None] = mapped_column(ForeignKey("cameras.id"), nullable=True)
    exit_camera_id: Mapped[int | None] = mapped_column(ForeignKey("cameras.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Bật AI nhận diện biển số cho bãi này: tự điền biển số lúc check-in (nếu chưa có)
    # + so khớp lại lúc check-out (ai_plate_match trên ParkingSession). Mặc định tắt.
    ai_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Cổng USB/COM đầu đọc RFID vật lý RIÊNG cho bãi này (vd /dev/ttyACM0,
    # /dev/ttyUSB1, COM3...) - cho phép nhiều bãi mỗi bãi 1 đầu đọc cắm cổng khác nhau,
    # quét thẻ ở đâu tự route đúng lot_id đó (RfidReaderManager). NULL/rỗng = bãi không
    # có đầu đọc riêng, fallback dùng cổng mặc định RFID_USB_PORT trong .env (lot_id=None
    # -> _resolve_lot tự chọn bãi active đầu tiên, giữ đúng hành vi cũ).
    rfid_usb_port: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

