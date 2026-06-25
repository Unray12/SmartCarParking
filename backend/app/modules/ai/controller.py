from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile

from app.dependencies import get_camera_manager
from app.modules.ai.schema import AiModelUploadOut, AiStatusOut, AiTestRequest, AiTestResultOut
from app.modules.ai.service import get_ai_status, save_model, test_camera_ai
from app.services.camera_stream import CameraStreamManager

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/status", response_model=AiStatusOut)
def ai_status_endpoint(camera_manager: CameraStreamManager = Depends(get_camera_manager)) -> AiStatusOut:
    return get_ai_status(camera_manager)


@router.post("/models", response_model=AiModelUploadOut)
def upload_model_endpoint(file: UploadFile = File(...)) -> AiModelUploadOut:
    return save_model(file)


@router.post("/test-camera", response_model=AiTestResultOut)
def test_camera_endpoint(
    payload: AiTestRequest,
    camera_manager: CameraStreamManager = Depends(get_camera_manager),
) -> AiTestResultOut:
    return test_camera_ai(payload.camera_id, camera_manager)
