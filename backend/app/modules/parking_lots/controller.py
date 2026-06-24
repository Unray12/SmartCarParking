from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database.session import get_db
from app.modules.parking_lots.schema import ParkingLotCreate, ParkingLotOut, ParkingLotOverviewOut, ParkingLotUpdate, SnapshotItemOut
from app.modules.parking_lots.service import (
    create_parking_lot,
    delete_parking_lot,
    get_parking_lot_overview,
    get_parking_lot,
    list_parking_lots_with_occupancy,
    list_snapshot_items,
    lot_to_out,
    update_parking_lot,
)

router = APIRouter(tags=["parking-lots"])


@router.get("/api/parking-lots", response_model=list[ParkingLotOut])
def list_parking_lots_endpoint(db: Session = Depends(get_db)) -> list[ParkingLotOut]:
    return list_parking_lots_with_occupancy(db)


@router.post("/api/parking-lots", response_model=ParkingLotOut)
def create_parking_lot_endpoint(payload: ParkingLotCreate, db: Session = Depends(get_db)) -> ParkingLotOut:
    lot = create_parking_lot(db, payload)
    return lot_to_out(lot, 0)


@router.put("/api/parking-lots/{lot_id}", response_model=ParkingLotOut)
def update_parking_lot_endpoint(lot_id: int, payload: ParkingLotUpdate, db: Session = Depends(get_db)) -> ParkingLotOut:
    lot = update_parking_lot(db, lot_id, payload)
    if not lot:
        raise HTTPException(status_code=404, detail="Parking lot not found")
    return lot_to_out(lot)


@router.delete("/api/parking-lots/{lot_id}")
def delete_parking_lot_endpoint(lot_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    ok = delete_parking_lot(db, lot_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Parking lot not found")
    return {"ok": True}


@router.get("/api/snapshots", response_model=list[SnapshotItemOut])
def list_snapshots_endpoint(lot_id: int | None = None, limit: int = 100, db: Session = Depends(get_db)) -> list[SnapshotItemOut]:
    return list_snapshot_items(db, lot_id=lot_id, limit=limit)


@router.get("/api/parking-lots/{lot_id}/overview", response_model=ParkingLotOverviewOut)
def parking_lot_overview_endpoint(lot_id: int, limit: int = 100, db: Session = Depends(get_db)) -> ParkingLotOverviewOut:
    overview = get_parking_lot_overview(db, lot_id=lot_id, limit=limit)
    if not overview:
        raise HTTPException(status_code=404, detail="Parking lot not found")
    return overview


@router.get("/api/snapshots/files/{folder}/{filename}", include_in_schema=False)
def snapshot_file_endpoint(folder: str, filename: str) -> FileResponse:
    settings = get_settings()
    root = (Path(__file__).resolve().parents[3] / settings.snapshot_store_dir).resolve()
    candidate = (root / folder / filename).resolve()
    if root not in candidate.parents:
        raise HTTPException(status_code=404, detail="Not found")
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(candidate)
