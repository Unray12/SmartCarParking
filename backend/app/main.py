from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.database.session import SessionLocal, init_db
from app.modules.router import api_router
from app.services.camera_stream import CameraStreamManager, StreamConfig
from app.services.plate_recognizer import load_plate_recognizer

settings = get_settings()
PROJECT_ROOT = Path(__file__).resolve().parents[2]
WEB_ROOT = PROJECT_ROOT / "frontend" / "renderer"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    recognizer = load_plate_recognizer(settings.plate_recognizer)
    stream_config = StreamConfig(
        target_fps=settings.stream_target_fps,
        jpeg_quality=settings.stream_jpeg_quality,
        max_width=settings.stream_max_width,
        infer_every_n_frames=settings.stream_infer_every_n_frames,
        plate_dedupe_seconds=settings.stream_plate_dedupe_seconds,
    )

    camera_manager = CameraStreamManager(
        db_session_factory=SessionLocal,
        recognizer=recognizer,
        config=stream_config,
    )
    app.state.camera_manager = camera_manager

    camera_manager.bootstrap_enabled_cameras()
    yield
    camera_manager.shutdown()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def disable_api_cache(request: Request, call_next):
    response = await call_next(request)

    if request.url.path.startswith("/api/") or request.url.path == "/health":
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        if "ETag" in response.headers:
            del response.headers["ETag"]
        if "Last-Modified" in response.headers:
            del response.headers["Last-Modified"]

    return response


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_router)


@app.get("/", include_in_schema=False)
def web_index() -> FileResponse:
    if not WEB_ROOT.exists():
        raise HTTPException(status_code=404, detail="Web frontend not found")
    return FileResponse(WEB_ROOT / "index.html")


@app.get("/{full_path:path}", include_in_schema=False)
def web_assets(full_path: str) -> FileResponse:
    if full_path.startswith(("api/", "docs", "redoc", "openapi.json", "health", "ws/")):
        raise HTTPException(status_code=404, detail="Not found")

    if not WEB_ROOT.exists():
        raise HTTPException(status_code=404, detail="Web frontend not found")

    candidate = (WEB_ROOT / full_path).resolve()
    if WEB_ROOT.resolve() not in candidate.parents and candidate != WEB_ROOT.resolve():
        raise HTTPException(status_code=404, detail="Not found")

    if candidate.is_file():
        return FileResponse(candidate)

    return FileResponse(WEB_ROOT / "index.html")
