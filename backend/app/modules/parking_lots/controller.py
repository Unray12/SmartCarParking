from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database.session import get_db
from app.dependencies import get_rfid_reader_manager
from app.modules.auth.dependencies import get_current_user_flexible
from app.modules.parking_lots.schema import ParkingLotCreate, ParkingLotOut, ParkingLotOverviewOut, ParkingLotUpdate, SnapshotItemOut, LotCaptureStatusOut
from app.modules.parking_lots.service import (
    create_parking_lot,
    delete_parking_lot,
    get_lot_capture_status,
    get_parking_lot_overview,
    get_parking_lot,
    list_parking_lots_with_occupancy,
    list_snapshot_items,
    lot_to_out,
    update_parking_lot,
)
from app.services.rfid_usb_reader import RfidReaderManager

# Protected router (gắn prefix /api/v1 + token ở router.py)
router = APIRouter(tags=["parking-lots"])

# <img>/<a> trên browser KHÔNG gửi được header Authorization, nên router này không nằm
# dưới dependencies=_auth ở router.py - nhưng vẫn bắt buộc token qua query string
# (?token=) bằng get_current_user_flexible ở từng endpoint, KHÔNG để mở hoàn toàn.
files_router = APIRouter(tags=["snapshots"])


@router.get("/parking-lots", response_model=list[ParkingLotOut])
def list_parking_lots_endpoint(db: Session = Depends(get_db)) -> list[ParkingLotOut]:
    return list_parking_lots_with_occupancy(db)


@router.post("/parking-lots", response_model=ParkingLotOut)
def create_parking_lot_endpoint(
    payload: ParkingLotCreate,
    db: Session = Depends(get_db),
    rfid_reader_manager: RfidReaderManager = Depends(get_rfid_reader_manager),
) -> ParkingLotOut:
    lot = create_parking_lot(db, payload, rfid_reader_manager)
    return lot_to_out(lot, 0)


@router.put("/parking-lots/{lot_id}", response_model=ParkingLotOut)
def update_parking_lot_endpoint(
    lot_id: int,
    payload: ParkingLotUpdate,
    db: Session = Depends(get_db),
    rfid_reader_manager: RfidReaderManager = Depends(get_rfid_reader_manager),
) -> ParkingLotOut:
    lot = update_parking_lot(db, lot_id, payload, rfid_reader_manager)
    if not lot:
        raise HTTPException(status_code=404, detail="Parking lot not found")
    return lot_to_out(lot)


@router.delete("/parking-lots/{lot_id}")
def delete_parking_lot_endpoint(
    lot_id: int,
    db: Session = Depends(get_db),
    rfid_reader_manager: RfidReaderManager = Depends(get_rfid_reader_manager),
) -> dict[str, bool]:
    ok = delete_parking_lot(db, lot_id, rfid_reader_manager)
    if not ok:
        raise HTTPException(status_code=404, detail="Parking lot not found")
    return {"ok": True}


@router.get("/snapshots", response_model=list[SnapshotItemOut])
def list_snapshots_endpoint(lot_id: int | None = None, limit: int = 100, db: Session = Depends(get_db)) -> list[SnapshotItemOut]:
    return list_snapshot_items(db, lot_id=lot_id, limit=limit)


@router.get("/parking-lots/{lot_id}/overview", response_model=ParkingLotOverviewOut)
def parking_lot_overview_endpoint(lot_id: int, limit: int = 100, db: Session = Depends(get_db)) -> ParkingLotOverviewOut:
    overview = get_parking_lot_overview(db, lot_id=lot_id, limit=limit)
    if not overview:
        raise HTTPException(status_code=404, detail="Parking lot not found")
    return overview


# Endpoint NHẸ, poll tần suất cao (gần realtime) cho riêng 2 ô capture + chip trạng thái -
# xem docstring get_lot_capture_status. Danh sách session/log/occupancy vẫn dùng /overview
# ở nhịp poll chậm hơn như cũ.
@router.get("/parking-lots/{lot_id}/capture-status", response_model=LotCaptureStatusOut)
def parking_lot_capture_status_endpoint(lot_id: int, db: Session = Depends(get_db)) -> LotCaptureStatusOut:
    status = get_lot_capture_status(db, lot_id=lot_id)
    if not status:
        raise HTTPException(status_code=404, detail="Parking lot not found")
    return status


@files_router.get("/snapshots/files/{folder}/{filename}", include_in_schema=False)
def snapshot_file_endpoint(folder: str, filename: str, _user: str = Depends(get_current_user_flexible)) -> FileResponse:
    settings = get_settings()
    root = (Path(__file__).resolve().parents[3] / settings.snapshot_store_dir).resolve()
    candidate = (root / folder / filename).resolve()
    if root not in candidate.parents:
        raise HTTPException(status_code=404, detail="Not found")
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(candidate)
