from __future__ import annotations

import os
import threading
import time
from queue import Empty, Full, Queue
from dataclasses import dataclass
from datetime import datetime, timedelta

import cv2
import numpy as np
from sqlalchemy import and_, select

from app.core.config import get_settings
from app.modules.cameras.model import Camera
from app.modules.plates.model import PlateRead
from app.services.plate_recognizer import PlateDetection, PlateRecognizer, normalize_plate

# OPENCV_FFMPEG_CAPTURE_OPTIONS là env var DÙNG CHUNG cho toàn process (mọi camera worker
# thread đều đọc/ghi cùng 1 biến này) - nếu không khoá, 2 camera khác loại nguồn (1 RTSP +
# 1 HTTP/MJPEG) mở gần như đồng thời có thể đọc nhầm giá trị của nhau (race condition).
# Đã tự phát hiện + verify: nếu 1 camera RTSP mở trước đó set rtsp_transport;tcp vào biến
# này, rồi 1 camera HTTP mở SAU (cùng process) mà không dọn lại biến -> HTTP capture vẫn
# isOpened()=True nhưng read()/retrieve() luôn fail (option rtsp_transport không hợp lệ
# với protocol HTTP) - lỗi thầm lặng, không exception, rất khó nhận ra nếu không test kỹ.
_capture_open_lock = threading.Lock()


@dataclass
class StreamConfig:
    target_fps: int = 15
    jpeg_quality: int = 70
    max_width: int = 1280
    capture_skip_grabs: int = 1
    infer_every_n_frames: int = 6
    plate_dedupe_seconds: int = 8
    enable_inference: bool = True
    # Xem comment ở core/config.py:Settings.stream_periodic_reconnect_seconds.
    periodic_reconnect_seconds: int = 1800


class CameraWorker:
    def __init__(
        self,
        camera_id: int,
        source_url: str,
        recognizer: PlateRecognizer,
        config: StreamConfig,
        on_detection,
    ) -> None:
        self.camera_id = camera_id
        self.source_url = source_url
        self._recognizer = recognizer
        self._config = config
        self._on_detection = on_detection

        self._lock = threading.Lock()
        self._frame_lock = threading.Lock()
        self._latest_jpeg: bytes | None = None
        self._latest_ts: float = 0.0
        self._latest_seq: int = 0
        self._latest_frame_bgr: np.ndarray | None = None
        self._latest_frame_seq: int = 0
        self._running = threading.Event()
        self._capture_thread: threading.Thread | None = None
        self._encode_thread: threading.Thread | None = None
        self._infer_thread: threading.Thread | None = None
        self._infer_queue: Queue[np.ndarray] = Queue(maxsize=1)

    def start(self) -> None:
        if self._capture_thread and self._capture_thread.is_alive():
            return
        self._running.set()
        self._capture_thread = threading.Thread(target=self._capture_loop, daemon=True, name=f"cam-capture-{self.camera_id}")
        self._encode_thread = threading.Thread(target=self._encode_loop, daemon=True, name=f"cam-encode-{self.camera_id}")
        self._infer_thread = threading.Thread(target=self._infer_loop, daemon=True)
        self._capture_thread.start()
        self._encode_thread.start()
        self._infer_thread.start()

    def stop(self) -> None:
        self._running.clear()
        if self._capture_thread and self._capture_thread.is_alive():
            self._capture_thread.join(timeout=2)
        if self._encode_thread and self._encode_thread.is_alive():
            self._encode_thread.join(timeout=2)
        if self._infer_thread and self._infer_thread.is_alive():
            self._infer_thread.join(timeout=2)
        self._capture_thread = None
        self._encode_thread = None
        self._infer_thread = None

    def latest_frame(self) -> tuple[bytes | None, float]:
        with self._lock:
            return self._latest_jpeg, self._latest_ts

    def latest_packet(self) -> tuple[bytes | None, float, int]:
        with self._lock:
            return self._latest_jpeg, self._latest_ts, self._latest_seq

    def latest_frame_bgr(self) -> np.ndarray | None:
        # Trả thẳng frame BGR thô mới nhất (nguồn của _encode_loop) - dùng cho AI test-camera
        # để khỏi phải giải mã lại JPEG (vốn vừa được encode TỪ chính frame này) chỉ để lấy
        # lại mảng BGR, tốn CPU vô ích trên máy yếu (NUC) và cộng dồn thêm độ trễ mỗi lần poll.
        with self._frame_lock:
            if self._latest_frame_bgr is None:
                return None
            return self._latest_frame_bgr.copy()

    def _open_capture(self):
        settings = get_settings()
        source = self.source_url
        # Set/dọn env var RỒI mở capture trong CÙNG 1 lần giữ khoá - bắt buộc phải atomic
        # với nhau, vì 2 worker thread (ví dụ 1 camera RTSP đang retry liên tục + 1 camera
        # HTTP khác đang mở lại) có thể tranh nhau đọc/ghi env var process-wide này ở tần
        # suất rất cao (mỗi lần reconnect) - đã tự verify: nhả khoá TRƯỚC VideoCapture(...)
        # để giảm thời gian giữ khoá tưởng an toàn, nhưng thực tế 2 luồng cùng retry nhanh
        # y hệt nhau vẫn trúng khe hở đó gần như mọi lần, làm 1 bên luôn đọc nhầm option
        # của bên kia (isOpened=True nhưng read() luôn fail, không lỗi rõ ràng).
        #
        # Để giữ khoá an toàn qua cả open() mà KHÔNG treo cả cụm khi 1 camera mất kết nối
        # im lặng (không phải "connection refused" mà không phản hồi gì - có thể treo hàng
        # chục giây): dùng constructor rỗng + set CAP_PROP_OPEN_TIMEOUT_MSEC TRƯỚC khi gọi
        # .open(), không phải sau như code cũ. cv2.VideoCapture(source, api) mở kết nối
        # NGAY trong constructor (đồng bộ) nên set timeout SAU đó không kịp áp dụng cho
        # lần mở đầu - đây là lý do timeout "5s" trước đây không thực sự có tác dụng.
        with _capture_open_lock:
            if source.startswith('rtsp://'):
                # rtsp_transport là AVOption của FFmpeg, KHÔNG phải query string của URL -
                # gắn "?rtsp_transport=tcp" vào URL (cách cũ) bị FFmpeg's RTSP demuxer bỏ
                # qua hoàn toàn, nên transport thực tế luôn rơi về UDP mặc định (dù đặt
                # STREAM_RTSP_TRANSPORT=tcp). Phải đi qua OPENCV_FFMPEG_CAPTURE_OPTIONS.
                # UDP qua NAT của Docker Desktop (WSL2/Hyper-V) trên Windows bị timeout sau
                # ~30s (conntrack UDP) -> luồng đứng hình, chỉ TCP mới ổn định trong container.
                transport = settings.stream_rtsp_transport.strip().lower() or "tcp"
                ffmpeg_opts = (settings.stream_ffmpeg_capture_options or "").strip()
                combined_opts = f"rtsp_transport;{transport}"
                if ffmpeg_opts:
                    combined_opts = f"{combined_opts}|{ffmpeg_opts}"
                # OpenCV/FFmpeg backend reads this env var when opening VideoCapture.
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = combined_opts
            else:
                # QUAN TRỌNG: nếu không dọn, giá trị rtsp_transport còn sót lại từ lần mở
                # camera RTSP trước đó (biến process-wide) sẽ áp nhầm vào nguồn HTTP/MJPEG
                # này -> isOpened()=True nhưng read()/retrieve() luôn fail âm thầm, không
                # exception. Đã tự verify được lỗi này bằng cách tái hiện chính xác kịch
                # bản: mở 1 rtsp:// (dù connect fail) rồi mở tiếp http:// trong cùng
                # process -> http bị hỏng cho tới khi biến này được dọn sạch.
                os.environ.pop("OPENCV_FFMPEG_CAPTURE_OPTIONS", None)

            cap = cv2.VideoCapture()
            # Buffer 1 frame only: always read the freshest frame → minimal latency.
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            cap.set(cv2.CAP_PROP_FPS, self._config.target_fps)
            # Set TRƯỚC khi open() để thực sự chặn được lần mở đầu (không phải best-effort
            # như code cũ) - đảm bảo open() không giữ khoá quá ~5s dù camera mất kết nối
            # im lặng, để các camera khác không bị treo theo dù đang chờ chung khoá.
            if hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
                cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
            if hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC"):
                cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 3000)
            cap.open(source, cv2.CAP_FFMPEG)
        return cap

    def _resize_if_needed(self, frame):
        if self._config.max_width <= 0:
            return frame
        h, w = frame.shape[:2]
        if w <= self._config.max_width:
            return frame
        ratio = self._config.max_width / float(w)
        # INTER_LINEAR thay vì INTER_AREA: rẻ hơn đáng kể trên CPU yếu (NUC) với chất
        # lượng downscale gần như không khác biệt sau khi ảnh còn bị nén JPEG quality 82
        # ngay sau đó - đổi vài ms CPU/frame lấy latency thấp hơn, tránh vòng capture bị
        # chậm hơn tốc độ camera đẩy frame (nguyên nhân gây backlog tích lũy thật sự).
        return cv2.resize(frame, (self._config.max_width, int(h * ratio)), interpolation=cv2.INTER_LINEAR)

    def _capture_loop(self) -> None:
        cap = None
        frame_counter = 0
        read_failures = 0
        reconnect_backoff = 0.15
        cap_opened_at = 0.0

        while self._running.is_set():
            loop_started = time.time()

            if cap is None or not cap.isOpened():
                if cap is not None:
                    cap.release()
                cap = self._open_capture()
                if not cap or not cap.isOpened():
                    time.sleep(min(reconnect_backoff, 1.5))
                    reconnect_backoff = min(reconnect_backoff * 1.6, 1.5)
                    continue
                # Reset backoff on successful open.
                reconnect_backoff = 0.15
                read_failures = 0
                cap_opened_at = loop_started

            # Reconnect chủ động định kỳ dù stream đang khỏe (không có read_failures) -
            # xem comment ở StreamConfig.periodic_reconnect_seconds. Mở lại tạo phiên
            # RTSP/HTTP MỚI bắt đầu từ "hiện tại", xóa sạch mọi backlog đã tích lũy âm
            # thầm trong buffer FFmpeg/OS - việc mà chỉ chờ lỗi mới reconnect không làm
            # được (stream vẫn "sống" nên không bao giờ tự trigger nhánh trên).
            reconnect_after = self._config.periodic_reconnect_seconds
            if reconnect_after > 0 and (loop_started - cap_opened_at) >= reconnect_after:
                cap.release()
                cap = None
                print(f"[CAMERA {self.camera_id}] Periodic reconnect after {reconnect_after}s (chống trễ tích lũy)")
                continue

            if not cap.grab():
                read_failures += 1
                # Avoid reconnect storm for transient decoder hiccups.
                if read_failures < 6:
                    time.sleep(0.02)
                    continue
                cap.release()
                cap = None
                read_failures = 0
                time.sleep(min(reconnect_backoff, 1.5))
                reconnect_backoff = min(reconnect_backoff * 1.4, 1.5)
                continue

            # capture_skip_grabs > 0: cố gắng vứt thêm frame cũ còn tồn trong buffer để
            # bắt kịp frame mới nhất (trim độ trễ) - CHỈ khi grab() còn thành công (tức
            # còn frame mới hơn thật sự chờ sẵn). Dừng ngay khi 1 lần grab() thất bại
            # (nguồn không kịp đẩy backlog, ví dụ HTTP/MJPEG chậm hoặc ảnh tĩnh) và vẫn
            # retrieve() frame đã grab() thành công gần nhất - tránh lỗi "mất hẳn frame"
            # (đã tự phát hiện bug này: gọi grab() thừa vô điều kiện làm retrieve() sau
            # đó fail hoàn toàn với nguồn không có backlog để vứt).
            # CHỈ áp dụng cho rtsp:// - đây là loại nguồn duy nhất chắc chắn đẩy frame
            # liên tục (camera thật qua mạng); HTTP/MJPEG hay nguồn tĩnh không có backlog
            # thật để vứt nên tự động giữ nguyên hành vi cũ (0 lần grab thừa), tránh phải
            # nhớ set STREAM_CAPTURE_SKIP_GRABS=0 thủ công mỗi khi trộn nhiều loại camera.
            if self.source_url.startswith("rtsp://"):
                for _ in range(max(0, self._config.capture_skip_grabs)):
                    if not cap.grab():
                        break

            ok, frame = cap.retrieve()
            if not ok or frame is None:
                read_failures += 1
                if read_failures < 6:
                    time.sleep(0.02)
                    continue
                cap.release()
                cap = None
                read_failures = 0
                time.sleep(min(reconnect_backoff, 1.5))
                reconnect_backoff = min(reconnect_backoff * 1.4, 1.5)
                continue

            read_failures = 0

            frame = self._resize_if_needed(frame)
            with self._frame_lock:
                self._latest_frame_bgr = frame
                self._latest_frame_seq += 1

            if self._config.enable_inference and self._config.infer_every_n_frames > 0 and frame_counter % self._config.infer_every_n_frames == 0:
                self._submit_infer_frame(frame)

            frame_counter += 1
            elapsed = time.time() - loop_started
            # Cap to target_fps. For RTSP, grab() already paces to the source
            # rate so this usually sleeps ~0; no forced floor → no added latency.
            sleep_s = (1.0 / self._config.target_fps) - elapsed
            if sleep_s > 0:
                time.sleep(sleep_s)

        if cap is not None:
            cap.release()

    def _encode_loop(self) -> None:
        last_encoded_seq = 0
        while self._running.is_set():
            frame: np.ndarray | None = None
            current_seq = 0
            with self._frame_lock:
                if self._latest_frame_bgr is not None and self._latest_frame_seq > last_encoded_seq:
                    frame = self._latest_frame_bgr.copy()
                    current_seq = self._latest_frame_seq

            if frame is None:
                time.sleep(0.003)
                continue

            encoded_ok, jpeg = cv2.imencode(
                ".jpg",
                frame,
                [
                    int(cv2.IMWRITE_JPEG_QUALITY), self._config.jpeg_quality,
                    int(cv2.IMWRITE_JPEG_OPTIMIZE), 0,
                ],
            )
            if not encoded_ok:
                time.sleep(0.001)
                continue

            now_ts = time.time()
            with self._lock:
                self._latest_jpeg = jpeg.tobytes()
                self._latest_ts = now_ts
                self._latest_seq += 1
            last_encoded_seq = current_seq

    def _submit_infer_frame(self, frame: np.ndarray) -> None:
        # Keep only the newest frame for inference to avoid backlog.
        frame_copy = frame.copy()
        try:
            self._infer_queue.put_nowait(frame_copy)
            return
        except Full:
            pass

        try:
            _ = self._infer_queue.get_nowait()
        except Empty:
            pass

        try:
            self._infer_queue.put_nowait(frame_copy)
        except Full:
            return

    def _infer_loop(self) -> None:
        while self._running.is_set():
            try:
                frame = self._infer_queue.get(timeout=0.5)
            except Empty:
                continue

            try:
                detections = self._recognizer.detect(frame)
                if detections:
                    self._on_detection(self.camera_id, detections)
            except Exception:
                continue


class CameraStreamManager:
    def __init__(
        self,
        db_session_factory,
        recognizer: PlateRecognizer,
        config: StreamConfig,
    ) -> None:
        self._db_session_factory = db_session_factory
        self._recognizer = recognizer
        self._config = config
        self._workers: dict[int, CameraWorker] = {}
        self._workers_lock = threading.Lock()

    @property
    def recognizer_name(self) -> str:
        return self._recognizer.__class__.__name__

    def bootstrap_enabled_cameras(self) -> None:
        with self._db_session_factory() as db:
            cameras = db.scalars(select(Camera).where(Camera.enabled.is_(True))).all()
        for camera in cameras:
            self._start_camera(camera.id, camera.source_url)

    def shutdown(self) -> None:
        with self._workers_lock:
            ids = list(self._workers.keys())
        for camera_id in ids:
            self._stop_camera(camera_id)

    def upsert_camera(self, camera: Camera) -> None:
        self._stop_camera(camera.id)
        if camera.enabled:
            self._start_camera(camera.id, camera.source_url)

    def set_enabled(self, camera_id: int, enabled: bool) -> None:
        with self._db_session_factory() as db:
            camera = db.get(Camera, camera_id)
            if not camera:
                return
            if enabled:
                self._start_camera(camera.id, camera.source_url)
            else:
                self._stop_camera(camera.id)

    def remove_camera(self, camera_id: int) -> None:
        self._stop_camera(camera_id)

    def get_latest_frame(self, camera_id: int) -> tuple[bytes | None, float]:
        with self._workers_lock:
            worker = self._workers.get(camera_id)
        if not worker:
            return None, 0.0
        return worker.latest_frame()

    def get_latest_packet(self, camera_id: int) -> tuple[bytes | None, float, int]:
        with self._workers_lock:
            worker = self._workers.get(camera_id)
        if not worker:
            return None, 0.0, 0
        return worker.latest_packet()

    def test_camera_ai(self, camera_id: int) -> tuple[bool, list[PlateDetection], np.ndarray | None]:
        with self._workers_lock:
            worker = self._workers.get(camera_id)
        if not worker:
            return False, [], None

        frame_bgr = worker.latest_frame_bgr()
        if frame_bgr is None:
            return False, [], None

        detections = self._recognizer.detect(frame_bgr)
        return True, detections, frame_bgr

    def _start_camera(self, camera_id: int, source_url: str) -> None:
        worker = CameraWorker(
            camera_id=camera_id,
            source_url=source_url,
            recognizer=self._recognizer,
            config=self._config,
            on_detection=self._handle_plate_detections,
        )
        with self._workers_lock:
            existing = self._workers.get(camera_id)
            if existing:
                existing.stop()
            self._workers[camera_id] = worker
        worker.start()

    def _stop_camera(self, camera_id: int) -> None:
        worker = None
        with self._workers_lock:
            worker = self._workers.pop(camera_id, None)
        if worker:
            worker.stop()

    def _handle_plate_detections(self, camera_id: int, detections: list[PlateDetection]) -> None:
        now = datetime.utcnow()
        min_seen = now - timedelta(seconds=self._config.plate_dedupe_seconds)

        with self._db_session_factory() as db:
            for detection in detections:
                plate = normalize_plate(detection.plate)
                if not plate:
                    continue

                duplicate_stmt = (
                    select(PlateRead)
                    .where(
                        and_(
                            PlateRead.camera_id == camera_id,
                            PlateRead.plate == plate,
                            PlateRead.seen_at >= min_seen,
                        )
                    )
                    .order_by(PlateRead.seen_at.desc())
                    .limit(1)
                )
                duplicate = db.scalar(duplicate_stmt)
                if duplicate:
                    continue

                db.add(
                    PlateRead(
                        camera_id=camera_id,
                        plate=plate,
                        confidence=detection.confidence,
                        seen_at=now,
                        linked=False,
                    )
                )

            db.commit()
