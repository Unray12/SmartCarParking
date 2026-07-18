from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.database.base import Base

settings = get_settings()
DATABASE_URL = settings.database_url

connect_args: dict[str, object] = {}
engine_kwargs: dict[str, object] = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    # Pool gọn cho máy yếu (NUC): đủ cho stream worker + request, tự tái tạo
    # kết nối cũ tránh "server closed the connection".
    engine_kwargs.update(pool_size=5, max_overflow=10, pool_recycle=1800, pool_timeout=30)

engine = create_engine(DATABASE_URL, connect_args=connect_args, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Import models so SQLAlchemy registers table metadata before create_all.
    from app.modules import models as _models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_runtime_schema()


def _ensure_runtime_schema() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    if "parking_sessions" in tables:
        existing = {col["name"] for col in inspector.get_columns("parking_sessions")}
        additions = [
            ("lot_id", "INTEGER"),
            ("exit_camera_id", "INTEGER"),
            ("entry_snapshot_path", "VARCHAR(512)"),
            ("exit_snapshot_path", "VARCHAR(512)"),
            ("fee", "INTEGER"),
            ("duration_minutes", "INTEGER"),
            ("ai_plate_match", "BOOLEAN"),
        ]
        with engine.begin() as conn:
            for name, sql_type in additions:
                if name in existing:
                    continue
                conn.execute(text(f"ALTER TABLE parking_sessions ADD COLUMN {name} {sql_type}"))

    if "rfid_events" in tables:
        event_cols = {col["name"] for col in inspector.get_columns("rfid_events")}
        if "result_status" not in event_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE rfid_events ADD COLUMN result_status VARCHAR(32)"))
        if "lot_id" not in event_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE rfid_events ADD COLUMN lot_id INTEGER"))

    if "parking_lots" in tables:
        lot_cols = {col["name"] for col in inspector.get_columns("parking_lots")}
        if "capacity" not in lot_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE parking_lots ADD COLUMN capacity INTEGER DEFAULT 50 NOT NULL"))
        if "ai_enabled" not in lot_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE parking_lots ADD COLUMN ai_enabled BOOLEAN DEFAULT FALSE NOT NULL"))
        if "rfid_usb_port" not in lot_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE parking_lots ADD COLUMN rfid_usb_port VARCHAR(64)"))

    # Index occupancy (idempotent). Postgres/SQLite đều hỗ trợ IF NOT EXISTS.
    if "parking_sessions" in tables:
        with engine.begin() as conn:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sessions_lot_exit ON parking_sessions (lot_id, exit_time)"))
            # Partial index CHỈ chứa session chưa check-out (exit_time IS NULL) - đây là
            # đường truy vấn nóng nhất của cả app: mỗi lần quẹt RFID (vào lẫn ra) đều phải
            # tìm "session đang gửi của thẻ này" (_latest_active_session_by_card). Vì
            # partial index chỉ vật lý hoá đúng các dòng thoả điều kiện, kích thước index
            # này giữ nguyên tỉ lệ với SỐ XE ĐANG GỬI (vài chục/trăm dòng), KHÔNG phình to
            # theo tổng lịch sử gửi xe (có thể lên hàng triệu dòng sau nhiều năm) - tách
            # "đang gửi" khỏi "đã ra" ngay trong index, không cần bảng riêng.
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_sessions_active_by_card "
                    "ON parking_sessions (rfid_card, entry_time DESC) WHERE exit_time IS NULL"
                )
            )
            # Cùng lý do trên nhưng phục vụ đếm occupancy theo bãi (_active_count_by_lot,
            # chạy mỗi lần poll danh sách bãi) - tách riêng khỏi ix_sessions_lot_exit (vẫn
            # giữ để phục vụ tra cứu lịch sử theo bãi bao gồm cả xe đã ra).
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_sessions_active_by_lot "
                    "ON parking_sessions (lot_id) WHERE exit_time IS NULL"
                )
            )

    # Cùng ý tưởng partial index cho plate_reads: _latest_unlinked_plate chỉ cần tìm
    # trong các bản ghi CHƯA được gán vào session nào (linked=False) - đa số bản ghi cũ
    # đã linked=True nên loại hẳn ra khỏi index giữ index này luôn nhỏ.
    if "plate_reads" in tables:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_plate_reads_unlinked "
                    "ON plate_reads (seen_at DESC) WHERE linked = false"
                )
            )
