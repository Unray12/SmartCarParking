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
    Fallback: DummyPlateRecognizer.
    """
    if spec is None:
        spec = os.getenv("PLATE_RECOGNIZER", "")
    spec = spec.strip()
    if not spec:
        return DummyPlateRecognizer()

    try:
        module_name, class_name = spec.split(":", 1)
        module = importlib.import_module(module_name)
        cls = getattr(module, class_name)
        recognizer = cls()
        if not hasattr(recognizer, "detect"):
            raise TypeError("Recognizer must implement detect(frame_bgr)")
        return recognizer
    except Exception as exc:
        print(f"[WARN] Cannot load recognizer '{spec}': {exc}. Using DummyPlateRecognizer.")
        return DummyPlateRecognizer()
