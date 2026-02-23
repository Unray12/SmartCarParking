from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AiStatusOut(BaseModel):
    recognizer_name: str
    models_dir: str
    uploaded_models: list[str]


class AiModelUploadOut(BaseModel):
    filename: str
    size_bytes: int
    saved_path: str


class AiTestRequest(BaseModel):
    camera_id: int


class AiDetectionOut(BaseModel):
    plate: str
    confidence: float | None


class AiTestResultOut(BaseModel):
    camera_id: int
    frame_available: bool
    tested_at: datetime
    detections: list[AiDetectionOut]
