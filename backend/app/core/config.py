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
    # >0: sau grab() đầu tiên, grab() thêm N lần rồi mới retrieve() - chủ động vứt bớt
    # frame cũ còn tồn trong buffer nội bộ của FFmpeg/OS socket để luôn hiển thị frame
    # MỚI NHẤT có thể, đánh đổi lấy fps hiển thị thấp hơn 1 chút. CHỈ AN TOÀN với nguồn
    # liên tục đẩy frame nhanh hơn tốc độ mình đọc (RTSP camera thật) - đã tự verify: bật
    # giá trị này cho nguồn HTTP/MJPEG tốc độ thấp (hoặc test bằng 1 ảnh tĩnh) làm
    # retrieve() sau grab() thừa bị fail liên tục -> MẤT HẲN frame, không phải chỉ giật.
    # Mặc định để 0 (an toàn cho mọi loại nguồn); chỉ tăng lên 1-2 nếu bạn CHẮC CHẮN
    # camera là RTSP thật, đang chạy ổn định, và vẫn còn thấy trễ sau khi đã giảm max_delay.
    stream_capture_skip_grabs: int = 0
    stream_ws_target_fps: int = 25
    stream_rtsp_transport: str = "tcp"
    # max_delay thấp (100ms thay vì 500ms/1s mặc định phổ biến) để FFmpeg không giữ lại
    # gói tin chờ ghép nối trước khi trả frame - đánh đổi lấy rủi ro giật hình nhẹ trên
    # mạng kém ổn định. LƯU Ý: chỉ được liệt kê MỖI KEY 1 LẦN - OpenCV parse chuỗi này
    # thành av_dict rồi set từng option, key trùng sẽ bị GHI ĐÈ (không cộng dồn), nên
    # 2 flag của fflags phải gộp chung bằng dấu "+" (nobuffer+discardcorrupt) chứ không
    # tách thành 2 mục "fflags;..." riêng (mục sau sẽ xoá mất mục trước, "nobuffer" sẽ
    # coi như never được set - đây là bug thực tế từng có trong default cũ của biến này).
    stream_ffmpeg_capture_options: str = "fflags;nobuffer+discardcorrupt|flags;low_delay|reorder_queue_size;0|max_delay;100000|allowed_media_types;video"
    stream_infer_every_n_frames: int = 0
    stream_enable_inference: bool = False
    stream_plate_dedupe_seconds: int = 8
    # Chủ động đóng+mở lại kết nối camera định kỳ dù stream vẫn "khỏe" (không lỗi). Lý
    # do: cv2.VideoCapture.grab()/retrieve() đọc frame TUẦN TỰ từ buffer nội bộ của
    # FFmpeg/OS - khác với các hàng "latest-wins" nội bộ app (encode/WS/frontend). Nếu
    # tốc độ vòng capture dù chỉ tạm thời chậm hơn tốc độ camera đẩy frame (CPU bận do
    # nhiều camera, GC, decode chậm...), một backlog thật hình thành trong buffer đó và
    # KHÔNG tự co lại (capture_skip_grabs mặc định tắt) - chỉ một kết nối MỚI (session
    # RTSP mới bắt đầu từ "hiện tại") mới xóa sạch được độ trễ đã tích lũy. Trước đây
    # reconnect chỉ xảy ra khi grab()/retrieve() thất bại thật sự - một stream "vẫn sống
    # nhưng đang trễ dần" không bao giờ tự trigger việc này. 0 = tắt cơ chế này.
    stream_periodic_reconnect_seconds: int = 1800
    ai_models_dir: str = "models_store"
    snapshot_store_dir: str = "snapshots_store"

    # ANPR (YOLOv5 ONNX 2 giai đoạn - detect biển + detect từng ký tự). Chỉ dùng khi
    # bãi xe có ai_enabled=True (xem parking_lots) - còn lại app không tự chạy AI.
    plate_detector_model: str = "LP_detector.onnx"
    plate_ocr_model: str = "LP_ocr.onnx"
    plate_detector_imgsz: int = 640
    plate_detector_conf: float = 0.5
    plate_ocr_conf: float = 0.6

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
