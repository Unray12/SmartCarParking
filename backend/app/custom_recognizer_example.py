from __future__ import annotations

import random

import numpy as np

from app.services.plate_recognizer import PlateDetection


class MyRecognizer:
    """
    Ví dụ recognizer để bạn thay bằng model thật.
    Hàm detect nhận frame BGR (numpy array) và trả list PlateDetection.
    """

    def detect(self, frame_bgr: np.ndarray) -> list[PlateDetection]:
        # TODO: chạy inference model thật ở đây.
        # Return demo ngẫu nhiên tần suất thấp để test luồng end-to-end.
        if random.random() < 0.005:
            return [PlateDetection(plate="30A12345", confidence=0.91)]
        return []
