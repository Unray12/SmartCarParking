from __future__ import annotations

from datetime import datetime
from enum import Enum


class LogType(str, Enum):
    RFID_IN = "rfid_in"
    RFID_OUT = "rfid_out"
    PLATE_READ = "plate_read"
    SESSION_IN = "session_in"
    SESSION_OUT = "session_out"
    CAMERA_ADDED = "camera_added"
    CAMERA_REMOVED = "camera_removed"


class LogEntry:
    def __init__(
        self,
        timestamp: datetime,
        log_type: LogType,
        message: str,
        details: dict | None = None,
    ):
        self.timestamp = timestamp
        self.log_type = log_type
        self.message = message
        self.details = details or {}

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp.isoformat(),
            "type": self.log_type.value,
            "message": self.message,
            "details": self.details,
        }
