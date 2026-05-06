from __future__ import annotations

# Import all SQLAlchemy models once so metadata is fully registered.
from app.modules.cameras.model import Camera
from app.modules.parking_lots.model import ParkingLot
from app.modules.plates.model import PlateRead
from app.modules.rfid.model import RfidEvent
from app.modules.sessions.model import ParkingSession

__all__ = ["Camera", "PlateRead", "ParkingSession", "RfidEvent", "ParkingLot"]
