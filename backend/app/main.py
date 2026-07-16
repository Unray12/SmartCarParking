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
from app.services.rfid_usb_reader import RfidUsbConfig, RfidUsbReader
from app.modules.rfid.service import ingest_rfid_event, find_plate_by_card
from app.modules.rfid.schema import RfidEventIn
from datetime import datetime

settings = get_settings()
PROJECT_ROOT = Path(__file__).resolve().parents[2]
WEB_ROOT = PROJECT_ROOT / "frontend" / "renderer"
_CAMERA_MANAGER: CameraStreamManager | None = None


def _handle_rfid_from_usb(direction: str, card_id: str) -> None:
    try:
        with SessionLocal() as db:
            # Auto-link plate from RFID card mapping
            plate = None
            from app.modules.rfid.service import find_plate_by_card
            plate = find_plate_by_card(card_id)

            payload = RfidEventIn(
                card_id=card_id,
                direction=direction,
                plate=plate,  # Auto-filled from RFID card mapping
                source="usb-rfid-reader",
                occurred_at=datetime.utcnow(),
                data={"from": "usb_serial"},
            )
            result = ingest_rfid_event(db, payload, camera_manager=_CAMERA_MANAGER)
            print(f"[RFID USB] {direction.upper()}: {card_id} → {result.status} (plate={result.plate})")
    except Exception as exc:
        print(f"[RFID USB] Error processing {card_id}: {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    # Seed tài khoản admin mặc định (admin/admin) nếu DB chưa có user.
    from app.modules.auth.service import ensure_admin_seed
    with SessionLocal() as db:
        ensure_admin_seed(db)

    recognizer = load_plate_recognizer(settings.plate_recognizer)
    stream_config = StreamConfig(
        target_fps=settings.stream_target_fps,
        jpeg_quality=settings.stream_jpeg_quality,
        max_width=settings.stream_max_width,
        capture_skip_grabs=settings.stream_capture_skip_grabs,
        infer_every_n_frames=settings.stream_infer_every_n_frames,
        plate_dedupe_seconds=settings.stream_plate_dedupe_seconds,
        enable_inference=settings.stream_enable_inference,
        periodic_reconnect_seconds=settings.stream_periodic_reconnect_seconds,
    )

    camera_manager = CameraStreamManager(
        db_session_factory=SessionLocal,
        recognizer=recognizer,
        config=stream_config,
    )
    app.state.camera_manager = camera_manager
    app.state.stream_ws_target_fps = settings.stream_ws_target_fps
    global _CAMERA_MANAGER
    _CAMERA_MANAGER = camera_manager

    camera_manager.bootstrap_enabled_cameras()

    rfid_config = RfidUsbConfig(
        port=settings.rfid_usb_port,
        baudrate=settings.rfid_usb_baudrate,
        queue_max_size=settings.rfid_usb_queue_max_size,
        enabled=settings.rfid_usb_enabled,
    )
    rfid_reader = RfidUsbReader(rfid_config, _handle_rfid_from_usb)
    rfid_reader.start()
    app.state.rfid_reader = rfid_reader

    yield

    rfid_reader.stop()
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


@app.get("/login", include_in_schema=False)
def web_login() -> FileResponse:
    if not WEB_ROOT.exists():
        raise HTTPException(status_code=404, detail="Web frontend not found")
    return FileResponse(WEB_ROOT / "login.html")


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
