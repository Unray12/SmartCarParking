from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "Smart Parking Backend"
    database_url: str
    admin_username: str
    admin_password: str
    rfid_link_window_seconds: int = 30
    cors_origins: str = "*"
    plate_recognizer: str = ""

    stream_target_fps: int = 12
    stream_jpeg_quality: int = 68
    stream_max_width: int = 854
    stream_infer_every_n_frames: int = 0
    stream_enable_inference: bool = False
    stream_plate_dedupe_seconds: int = 8
    ai_models_dir: str = "models_store"

    # RFID USB Serial
    rfid_usb_port: str = "/dev/ttyUSB0"
    rfid_usb_baudrate: int = 115200
    rfid_usb_queue_max_size: int = 500
    rfid_usb_enabled: bool = True

    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
