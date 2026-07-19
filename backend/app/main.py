from __future__ import annotations

import time
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
from app.services.rfid_usb_reader import RfidReaderManager
from app.modules.rfid.service import ingest_rfid_event, get_rfid_card
from app.modules.rfid.schema import RfidEventIn
from datetime import datetime

settings = get_settings()
PROJECT_ROOT = Path(__file__).resolve().parents[2]
WEB_ROOT = PROJECT_ROOT / "frontend" / "renderer"
_CAMERA_MANAGER: CameraStreamManager | None = None

# Debounce phía BACKEND (bổ sung, độc lập với debounce ở firmware) - lưới an toàn thứ
# 2: nếu vì lý do gì đó (firmware restart mất state debounce, nhiễu khiến 1 lần quẹt
# sinh 2 dòng serial sát nhau...) cùng 1 (bãi, hướng, thẻ) tới backend 2 lần liên tiếp,
# lần thứ 2 trong cửa sổ dưới đây bị bỏ qua NGAY (trước khi mở DB session) - không phụ
# thuộc hoàn toàn vào phần cứng debounce đúng. In-memory (đủ dùng, 1 process/instance).
_RFID_DEBOUNCE_SECONDS = 1.0
_rfid_debounce_seen: dict[str, float] = {}


def _rfid_debounced(direction: str, card_id: str, lot_id: int | None) -> bool:
    key = f"{lot_id}:{direction}:{card_id}"
    now = time.monotonic()
    last = _rfid_debounce_seen.get(key)
    _rfid_debounce_seen[key] = now
    return last is not None and (now - last) < _RFID_DEBOUNCE_SECONDS


def _handle_rfid_from_usb(direction: str, card_id: str, lot_id: int | None = None) -> None:
    """Callback dùng chung cho MỌI đầu đọc RFID (cổng mặc định lẫn cổng riêng từng bãi
    qua RfidReaderManager) - lot_id do RfidReaderManager gắn sẵn theo cổng nào gọi vào,
    None nghĩa là cổng mặc định (ingest_rfid_event tự fallback bãi active đầu tiên)."""
    if _rfid_debounced(direction, card_id, lot_id):
        print(f"[RFID USB] Debounced (trùng trong {_RFID_DEBOUNCE_SECONDS}s): lot={lot_id} {direction} {card_id}")
        return
    try:
        with SessionLocal() as db:
            # Dùng CHUNG 1 session cho cả tra cứu biển số lẫn ingest (trước đây
            # find_plate_by_card() tự mở session RIÊNG - mỗi session mới phải checkout
            # kết nối từ pool (pool_pre_ping=True → thêm 1 round-trip "ping" DB) - gộp
            # lại còn 1 session giảm ~1 round-trip DB mỗi lần quẹt thẻ, đọc nhanh hơn.
            card = get_rfid_card(db, card_id)
            plate = card.plate if card and card.is_active else None

            payload = RfidEventIn(
                card_id=card_id,
                direction=direction,
                plate=plate,  # Auto-filled from RFID card mapping
                lot_id=lot_id,
                source="usb-rfid-reader",
                occurred_at=datetime.utcnow(),
                data={"from": "usb_serial"},
            )
            result = ingest_rfid_event(db, payload, camera_manager=_CAMERA_MANAGER)
            print(f"[RFID USB] lot={lot_id} {direction.upper()}: {card_id} → {result.status} (plate={result.plate})")
    except Exception as exc:
        print(f"[RFID USB] Error processing {card_id} (lot={lot_id}): {exc}")


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
        webrtc_enabled=settings.stream_webrtc_enabled,
        mediamtx_api_url=settings.mediamtx_api_url,
        mediamtx_rtsp_base=settings.mediamtx_rtsp_base,
        internal_token=settings.stream_internal_token,
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

    # 1 đầu đọc "mặc định" (RFID_USB_PORT trong .env, dùng cho bãi không gán cổng
    # riêng) + N đầu đọc riêng theo từng bãi (ParkingLot.rfid_usb_port) - xem
    # services/rfid_usb_reader.py:RfidReaderManager.
    rfid_reader_manager = RfidReaderManager(
        db_session_factory=SessionLocal,
        event_handler=_handle_rfid_from_usb,
        default_port=settings.rfid_usb_port,
        baudrate=settings.rfid_usb_baudrate,
        queue_max_size=settings.rfid_usb_queue_max_size,
        enabled=settings.rfid_usb_enabled,
    )
    rfid_reader_manager.start()
    app.state.rfid_reader_manager = rfid_reader_manager

    yield

    rfid_reader_manager.shutdown()
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
