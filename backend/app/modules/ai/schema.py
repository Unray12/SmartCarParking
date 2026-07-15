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
    # (x1, y1, x2, y2) trên đúng frame đang stream qua WS cùng camera_id - FE vẽ box lên
    # canvas không cần quy đổi toạ độ (test-camera dùng chung get_latest_frame với WS).
    box: tuple[int, int, int, int] | None = None


class AiTestResultOut(BaseModel):
    camera_id: int
    frame_available: bool
    tested_at: datetime
    detections: list[AiDetectionOut]
