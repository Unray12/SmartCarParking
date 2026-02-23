from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.core.config import get_settings
from app.modules.ai.schema import AiDetectionOut, AiModelUploadOut, AiStatusOut, AiTestResultOut
from app.services.camera_stream import CameraStreamManager

settings = get_settings()
ALLOWED_EXTENSIONS = {".pt", ".onnx", ".pth", ".engine", ".pkl", ".bin"}


def _models_root() -> Path:
    backend_root = Path(__file__).resolve().parents[3]
    target = (backend_root / settings.ai_models_dir).resolve()
    target.mkdir(parents=True, exist_ok=True)
    return target


def _safe_filename(name: str) -> str:
    candidate = Path(name).name.strip().replace(" ", "_")
    if not candidate:
        raise HTTPException(status_code=400, detail="Invalid filename")
    ext = Path(candidate).suffix.lower()
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported model extension: {ext}")
    return candidate


def get_ai_status(camera_manager: CameraStreamManager) -> AiStatusOut:
    root = _models_root()
    files = sorted([p.name for p in root.iterdir() if p.is_file()])
    return AiStatusOut(
        recognizer_name=camera_manager.recognizer_name,
        models_dir=str(root),
        uploaded_models=files,
    )


def save_model(file: UploadFile) -> AiModelUploadOut:
    filename = _safe_filename(file.filename or "model.bin")
    target = _models_root() / filename

    size = 0
    with target.open("wb") as output:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            output.write(chunk)

    return AiModelUploadOut(
        filename=filename,
        size_bytes=size,
        saved_path=str(target),
    )


def test_camera_ai(camera_id: int, camera_manager: CameraStreamManager) -> AiTestResultOut:
    frame_available, detections = camera_manager.test_camera_ai(camera_id)
    mapped = [AiDetectionOut(plate=item.plate, confidence=item.confidence) for item in detections]

    return AiTestResultOut(
        camera_id=camera_id,
        frame_available=frame_available,
        tested_at=datetime.utcnow(),
        detections=mapped,
    )
