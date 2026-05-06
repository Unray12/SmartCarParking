from __future__ import annotations

import threading
import time
from queue import Empty, Full, Queue
from dataclasses import dataclass
from datetime import datetime, timedelta

import cv2
import numpy as np
from sqlalchemy import and_, select

from app.modules.cameras.model import Camera
from app.modules.plates.model import PlateRead
from app.services.plate_recognizer import PlateDetection, PlateRecognizer, normalize_plate


@dataclass
class StreamConfig:
    target_fps: int = 15
    jpeg_quality: int = 70
    max_width: int = 1280
    infer_every_n_frames: int = 6
    plate_dedupe_seconds: int = 8
    enable_inference: bool = True


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
        self._latest_jpeg: bytes | None = None
        self._latest_ts: float = 0.0
        self._running = threading.Event()
        self._thread: threading.Thread | None = None
        self._infer_thread: threading.Thread | None = None
        self._infer_queue: Queue[np.ndarray] = Queue(maxsize=1)

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._running.set()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._infer_thread = threading.Thread(target=self._infer_loop, daemon=True)
        self._thread.start()
        self._infer_thread.start()

    def stop(self) -> None:
        self._running.clear()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        if self._infer_thread and self._infer_thread.is_alive():
            self._infer_thread.join(timeout=2)
        self._thread = None
        self._infer_thread = None

    def latest_frame(self) -> tuple[bytes | None, float]:
        with self._lock:
            return self._latest_jpeg, self._latest_ts

    def _open_capture(self):
        source = self.source_url
        if source.startswith('rtsp://'):
            source = source + '?rtsp_transport=tcp' if '?' not in source else source.replace('?', '?rtsp_transport=tcp&')
        cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)
        cap.set(cv2.CAP_PROP_FPS, self._config.target_fps)
        return cap

    def _resize_if_needed(self, frame):
        if self._config.max_width <= 0:
            return frame
        h, w = frame.shape[:2]
        if w <= self._config.max_width:
            return frame
        ratio = self._config.max_width / float(w)
        return cv2.resize(frame, (self._config.max_width, int(h * ratio)), interpolation=cv2.INTER_AREA)

    def _run(self) -> None:
        cap = None
        frame_counter = 0

        while self._running.is_set():
            loop_started = time.time()

            if cap is None or not cap.isOpened():
                if cap is not None:
                    cap.release()
                cap = self._open_capture()
                if not cap or not cap.isOpened():
                    time.sleep(1.0)
                    continue

            ok, frame = cap.read()
            if not ok or frame is None:
                cap.release()
                cap = None
                time.sleep(0.2)
                continue

            frame = self._resize_if_needed(frame)
            encoded_ok, jpeg = cv2.imencode(
                ".jpg",
                frame,
                [
                    int(cv2.IMWRITE_JPEG_QUALITY), self._config.jpeg_quality,
                    int(cv2.IMWRITE_JPEG_OPTIMIZE), 0  # Skip optimization for speed
                ],
            )
            if encoded_ok:
                jpeg_bytes = jpeg.tobytes()
                now_ts = time.time()
                with self._lock:
                    self._latest_jpeg = jpeg_bytes
                    self._latest_ts = now_ts

                if self._config.enable_inference and self._config.infer_every_n_frames > 0 and frame_counter % self._config.infer_every_n_frames == 0:
                    self._submit_infer_frame(frame)

            frame_counter += 1
            elapsed = time.time() - loop_started
            # Minimal sleep for max throughput
            sleep_s = max(0.001, (1.0 / self._config.target_fps) - elapsed)
            if sleep_s > 0:
                time.sleep(sleep_s)

        if cap is not None:
            cap.release()

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

    def test_camera_ai(self, camera_id: int) -> tuple[bool, list[PlateDetection]]:
        frame_bytes, _ = self.get_latest_frame(camera_id)
        if not frame_bytes:
            return False, []

        frame_np = np.frombuffer(frame_bytes, dtype=np.uint8)
        frame_bgr = cv2.imdecode(frame_np, cv2.IMREAD_COLOR)
        if frame_bgr is None:
            return False, []

        detections = self._recognizer.detect(frame_bgr)
        return True, detections

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
