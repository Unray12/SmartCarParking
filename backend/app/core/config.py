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
    jwt_expire_minutes: int = 10080  # 7 ngày
    # Token RIÊNG, ngắn hạn, CHỈ dùng cho 1 file snapshot cụ thể (gắn sẵn vào image_url do
    # backend trả về) - khác JWT đăng nhập (7 ngày, toàn quyền API). Ảnh <img src> phải mang
    # token qua query string (browser không tự gắn header) - nếu dùng thẳng JWT đăng nhập ở
    # đó, URL ảnh lộ ra (log truy cập, lịch sử trình duyệt, chia sẻ màn hình...) là lộ luôn
    # token toàn quyền 7 ngày. Token snapshot hết hạn nhanh + chỉ mở đúng 1 path nên lộ ra
    # cũng không đoán/dùng được cho ảnh khác hay endpoint khác.
    snapshot_token_ttl_seconds: int = 600  # 10 phút
    rfid_link_window_seconds: int = 30
    cors_origins: str = "*"
    plate_recognizer: str = ""
    # Bật nút "Giả lập quét RFID" ở trang Parking Lots (không cần đầu đọc thật để test
    # nhanh luồng vào/ra). Mặc định TẮT - chỉ bật khi cần test, tránh lộ nút giả lập cho
    # người dùng vận hành thật. Xem modules/parking_lots/controller.py, frontend parking.js.
    rfid_test_mode_enabled: bool = False

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
    # MỚI NHẤT có thể, đánh đổi lấy fps hiển thị thấp hơn 1 chút. CameraWorker._capture_loop
    # chỉ áp dụng giá trị này khi source_url là rtsp:// thật (nguồn duy nhất chắc chắn đẩy
    # frame liên tục) - HTTP/MJPEG hay nguồn tĩnh tự động bỏ qua nên bật > 0 ở đây an toàn
    # dù hệ thống trộn nhiều loại camera. Tăng lên 2 nếu vẫn còn trễ sau khi đã giảm
    # max_delay và xác nhận camera RTSP đang chạy ổn định (0 grab/retrieve fail trong log).
    stream_capture_skip_grabs: int = 1
    stream_ws_target_fps: int = 25
    stream_rtsp_transport: str = "tcp"
    # max_delay 10ms (giảm từ 100ms) để FFmpeg không giữ lại gói tin chờ ghép nối trước
    # khi trả frame - đánh đổi lấy rủi ro giật hình nhẹ trên mạng kém ổn định. Đã tự
    # verify bằng script độc lập trên 2 camera RTSP H.264 thật (CBR, đã tune GOP ngắn +
    # 1 camera vẫn cấu hình cũ): cả 2 chạy sạch (0 grab/retrieve fail) xuống tới 1ms,
    # chọn 10ms để chừa biên độ an toàn cho jitter mạng thực tế ngoài phòng test. Nếu
    # sau này thấy giật/lỗi decode (đặc biệt trên mạng kém ổn định hơn), tăng dần lại
    # (30000-100000) - đây là điểm cân bằng trễ/ổn định, không có giá trị đúng tuyệt đối
    # cho mọi mạng. LƯU Ý: chỉ được liệt kê MỖI KEY 1 LẦN - OpenCV parse chuỗi này
    # thành av_dict rồi set từng option, key trùng sẽ bị GHI ĐÈ (không cộng dồn), nên
    # 2 flag của fflags phải gộp chung bằng dấu "+" (nobuffer+discardcorrupt) chứ không
    # tách thành 2 mục "fflags;..." riêng (mục sau sẽ xoá mất mục trước, "nobuffer" sẽ
    # coi như never được set - đây là bug thực tế từng có trong default cũ của biến này).
    stream_ffmpeg_capture_options: str = "fflags;nobuffer+discardcorrupt|flags;low_delay|reorder_queue_size;0|max_delay;10000|allowed_media_types;video"
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

    # ==== WebRTC qua MediaMTX (kiến trúc mới: RTSP -> MediaMTX -> WebRTC -> browser) ====
    # Bật đường hiển thị WebRTC. Browser lấy H.264 gốc từ MediaMTX (không re-encode JPEG),
    # decode bằng phần cứng -> trễ thấp hơn hẳn đường JPEG-over-WS cũ (vẫn giữ làm fallback).
    stream_webrtc_enabled: bool = True
    # URL Control API của MediaMTX (chỉ backend gọi, trong docker network - KHÔNG expose ra
    # host). Backend dùng để thêm/xoá path động mỗi khi camera bật/tắt/xoá.
    mediamtx_api_url: str = "http://mediamtx:9997"
    # Địa chỉ RTSP nội bộ MediaMTX phát lại (re-publish) - AI worker & fallback JPEG đọc từ
    # đây thay vì nối thẳng camera, để camera chỉ chịu DUY NHẤT 1 kết nối (từ MediaMTX).
    mediamtx_rtsp_base: str = "rtsp://mediamtx:8554"
    # Host:port WHEP mà BROWSER truy cập trực tiếp (phải reachable từ máy client). Để trống
    # => frontend tự suy ra từ window.location.hostname + cổng mặc định 8889. Chỉ set khi
    # MediaMTX nằm sau reverse-proxy/tên miền khác.
    mediamtx_webrtc_public_base: str = ""
    # Token nội bộ để AI worker/fallback đọc RTSP re-publish qua auth của MediaMTX (endpoint
    # /streaming/mediamtx-auth chấp nhận token này HOẶC JWT hợp lệ). Đổi ở production.
    stream_internal_token: str = "CHANGE_ME_internal_stream_token"

    ai_models_dir: str = "models_store"
    snapshot_store_dir: str = "snapshots_store"

    # ANPR (YOLOv5 ONNX 2 giai đoạn - detect biển + detect từng ký tự). Chỉ dùng khi
    # bãi xe có ai_enabled=True (xem parking_lots) - còn lại app không tự chạy AI.
    plate_detector_model: str = "LP_detector.onnx"
    plate_ocr_model: str = "LP_ocr.onnx"
    plate_detector_imgsz: int = 640
    plate_detector_conf: float = 0.5
    plate_ocr_conf: float = 0.6
    # Camera cổng vào/ra chỉ chụp ĐÚNG 1 xe/1 biển mỗi lượt (kiến trúc 1 camera = 1 làn) -
    # nhưng detector hay trả về NHIỀU box "license_plate" trên 1 frame (nhiễu/vật thể nhỏ bị
    # nhận nhầm) - đã tự đo trên ảnh thật: 1 frame ra 6 box, 2 box OCR ra chuỗi rác
    # ("59G163188", "59U116124" - dài bất thường) với confidence gần bằng biển thật, suýt
    # thắng trong max(detections, key=confidence) ở rfid/service.py - RỦI RO GÁN NHẦM BIỂN
    # thật. Chỉ OCR tối đa N box tự tin nhất theo det_conf (giảm hẳn rác, đã verify riêng
    # bước này đủ loại bỏ cả 2 box rác nói trên) - KHÔNG lọc theo kích thước box (từng thử,
    # bỏ lại: biển ở xa/camera zoom rộng hợp lệ dù nhỏ, lọc cứng theo pixel làm bỏ sót biển
    # thật tùy setup camera - xem changelog.md).
    plate_detector_max_boxes: int = 2

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
