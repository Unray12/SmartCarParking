from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "Smart Parking Backend"
    database_url: str
    # Chỉ dùng làm giá trị SEED admin lần đầu (sau đó DB là nguồn sự thật, đổi qua API).
    admin_username: str = "admin"
    admin_password: str = "admin"

    # JWT (bảo vệ API bằng Bearer token)
    jwt_secret: str = "CHANGE_ME_dev_secret_please_override_in_env"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 720  # 12 giờ
    rfid_link_window_seconds: int = 30
    cors_origins: str = "*"
    plate_recognizer: str = ""

    # Parking fee (tính phí gửi xe)
    parking_currency: str = "đ"
    parking_fee_base: int = 0            # phí cố định mỗi lượt
    parking_fee_per_block: int = 5000    # phí mỗi block thời gian
    parking_fee_block_minutes: int = 60  # độ dài 1 block (phút)
    parking_free_minutes: int = 15       # số phút miễn phí đầu
    parking_default_capacity: int = 50   # sức chứa mặc định khi tạo bãi

    stream_target_fps: int = 25
    stream_jpeg_quality: int = 82
    stream_max_width: int = 1280
    stream_capture_skip_grabs: int = 0
    stream_ws_target_fps: int = 25
    stream_rtsp_transport: str = "tcp"
    stream_ffmpeg_capture_options: str = "fflags;nobuffer|flags;low_delay|reorder_queue_size;1024|max_delay;1000000|fflags;discardcorrupt|allowed_media_types;video"
    stream_infer_every_n_frames: int = 0
    stream_enable_inference: bool = False
    stream_plate_dedupe_seconds: int = 8
    ai_models_dir: str = "models_store"
    snapshot_store_dir: str = "snapshots_store"

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
