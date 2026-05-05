from __future__ import annotations

import re
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    pass

try:
    from paddleocr import PaddleOCR
    _PADDLE_OK = True
except Exception:
    PaddleOCR = None
    _PADDLE_OK = False

from app.services.plate_recognizer import PLATE_RE, PlateDetection, PlateRecognizer, normalize_plate


class PaddlePlateRecognizer(PlateRecognizer):
    def __init__(self) -> None:
        if not _PADDLE_OK:
            raise RuntimeError("paddleocr not installed")
        # Use 'en' for alphanumeric plates; Vietnamese plates are Latin+digits
        self._ocr = PaddleOCR(
            use_angle_cls=False,
            lang="en",
        )

    def detect(self, frame_bgr: np.ndarray) -> list[PlateDetection]:
        frame_rgb = frame_bgr[:, :, ::-1]  # BGR → RGB
        try:
            result = self._ocr.ocr(frame_rgb)
        except Exception:
            return []

        if not result or not result[0]:
            return []

        detections: list[PlateDetection] = []
        seen_plates = set()

        for line in result[0]:
            # line: [box, (text, conf)]
            if not line or len(line) < 2:
                continue
            text, conf = line[1]
            if not text or not conf:
                continue

            # Normalize plate text
            plate = normalize_plate(text)
            if not plate or len(plate) < 4 or len(plate) > 12:
                continue

            # Basic validation: must start with digits (Vietnamese plate format)
            if not any(c.isdigit() for c in plate[:2]):
                continue

            # Avoid duplicates in same frame
            if plate in seen_plates:
                continue
            seen_plates.add(plate)

            detections.append(
                PlateDetection(plate=plate, confidence=float(conf))
            )

        return detections
