from __future__ import annotations

import importlib
import os
import re
from dataclasses import dataclass
from typing import Protocol

import numpy as np

PLATE_RE = re.compile(r"[^A-Z0-9]")


@dataclass(frozen=True)
class PlateDetection:
    plate: str
    confidence: float | None = None
    # (x1, y1, x2, y2) toạ độ box biển số trên frame gốc đưa vào detect() - dùng để vẽ
    # box lên ảnh snapshot. None nếu recognizer không trả toạ độ (ví dụ Paddle/Dummy).
    box: tuple[int, int, int, int] | None = None


class PlateRecognizer(Protocol):
    def detect(self, frame_bgr: np.ndarray) -> list[PlateDetection]:
        ...


class DummyPlateRecognizer:
    def detect(self, frame_bgr: np.ndarray) -> list[PlateDetection]:
        return []


def normalize_plate(raw: str) -> str:
    upper = raw.upper().strip()
    return PLATE_RE.sub("", upper)


def load_plate_recognizer(spec: str | None = None) -> PlateRecognizer:
    """
    Load custom recognizer by env `PLATE_RECOGNIZER` using format `module.path:ClassName`.
    Fallback: try PaddlePlateRecognizer, then DummyPlateRecognizer.
    """
    if spec is None:
        spec = os.getenv("PLATE_RECOGNIZER", "")
    spec = spec.strip()

    # If spec is provided, try to load it (for PaddlePlateRecognizer)
    if spec:
        try:
            module_name, class_name = spec.split(":", 1)
            module = importlib.import_module(module_name)
            cls = getattr(module, class_name)
            recognizer = cls()
            if not hasattr(recognizer, "detect"):
                raise TypeError("Recognizer must implement detect(frame_bgr)")
            print(f"[INFO] Loaded recognizer: {spec}")
            return recognizer
        except Exception as exc:
            print(f"[WARN] Cannot load recognizer '{spec}': {exc}. Trying PaddleOCR...")
            # Fall through to auto-try

    # Auto-try PaddleOCR
    try:
        from app.services.paddle_plate_recognizer import PaddlePlateRecognizer
        recognizer = PaddlePlateRecognizer()
        print("[INFO] Loaded PaddlePlateRecognizer")
        return recognizer
    except Exception as exc:
        print(f"[WARN] Cannot load PaddlePlateRecognizer: {exc}. Using DummyPlateRecognizer.")
        return DummyPlateRecognizer()
