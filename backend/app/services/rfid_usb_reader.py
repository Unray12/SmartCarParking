from __future__ import annotations

from queue import Empty, Full, Queue
import re
import threading
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Callable

from sqlalchemy import select

try:
    import serial
    from serial.serialutil import SerialException
except ImportError:
    serial = None  # type: ignore[assignment]

if TYPE_CHECKING:
    from app.modules.parking_lots.model import ParkingLot


RFID_PATTERN = re.compile(r"\{(in|out):\s*([0-9A-Fa-f:]*)\}")


@dataclass
class RfidUsbConfig:
    port: str = "/dev/ttyUSB0"
    baudrate: int = 115200
    timeout: float = 0.5
    retry_interval: float = 3.0
    queue_max_size: int = 500
    enabled: bool = True


RfidCallback = Callable[[str, str], None]  # (direction, card_id) -> None


class RfidUsbReader:
    def __init__(self, config: RfidUsbConfig, on_rfid: RfidCallback) -> None:
        self._config = config
        self._on_rfid = on_rfid
        self._running = threading.Event()
        self._reader_thread: threading.Thread | None = None
        self._consumer_thread: threading.Thread | None = None
        self._ser: serial.Serial | None = None
        self._event_queue: Queue[tuple[str, str, float]] = Queue(maxsize=max(10, config.queue_max_size))
        self._last_open_error: str | None = None

    def start(self) -> None:
        if not self._config.enabled:
            print("[RFID USB] Disabled by config")
            return
        if serial is None:
            print("[RFID USB] pyserial not installed, USB reader is disabled")
            return
        if self._reader_thread and self._reader_thread.is_alive():
            return
        self._running.set()
        self._reader_thread = threading.Thread(target=self._read_loop, daemon=True, name="rfid-usb-reader")
        self._consumer_thread = threading.Thread(target=self._consume_loop, daemon=True, name="rfid-usb-consumer")
        self._reader_thread.start()
        self._consumer_thread.start()
        print(
            f"[RFID USB] Reader started on {self._config.port} "
            f"(baud={self._config.baudrate}, queue={self._event_queue.maxsize})"
        )

    def stop(self) -> None:
        self._running.clear()
        if self._reader_thread and self._reader_thread.is_alive():
            self._reader_thread.join(timeout=2)
        if self._consumer_thread and self._consumer_thread.is_alive():
            self._consumer_thread.join(timeout=2)
        self._reader_thread = None
        self._consumer_thread = None
        if self._ser:
            try:
                self._ser.close()
            except Exception:
                pass
            self._ser = None

    def _ensure_serial(self) -> bool:
        if self._ser and self._ser.is_open:
            return True
        try:
            self._ser = serial.Serial(
                port=self._config.port,
                baudrate=self._config.baudrate,
                timeout=self._config.timeout,
            )
            self._last_open_error = None
            print(f"[RFID USB] Connected: {self._config.port}")
            return True
        except (SerialException, OSError) as exc:
            self._ser = None
            err = f"{type(exc).__name__}: {exc}"
            if err != self._last_open_error:
                print(f"[RFID USB] Cannot open {self._config.port} @ {self._config.baudrate}: {err}")
                self._last_open_error = err
            return False

    def _enqueue_event(self, direction: str, card_id: str) -> None:
        item = (direction, card_id, time.time())
        try:
            self._event_queue.put_nowait(item)
            return
        except Full:
            pass

        # Queue full: drop oldest to keep latest events and prevent overflow.
        try:
            self._event_queue.get_nowait()
        except Empty:
            pass

        try:
            self._event_queue.put_nowait(item)
            print("[RFID USB] Queue full, dropped oldest event")
        except Full:
            print("[RFID USB] Queue still full, skipped event")

    def _read_loop(self) -> None:
        buffer = ""
        while self._running.is_set():
            if not self._ensure_serial():
                time.sleep(self._config.retry_interval)
                continue

            try:
                raw = self._ser.readline()
                if not raw:
                    continue
                text = raw.decode("utf-8", errors="replace").strip()
                if not text:
                    continue
                print(f"[RFID USB RAW] {text}")

                buffer = text
                m = RFID_PATTERN.search(buffer)
                if not m:
                    continue

                direction, card_id = m.group(1), m.group(2)
                card_id = card_id.strip()
                if not card_id:
                    # Device heartbeat/test line without RFID tag; ignore business event.
                    print(f"[RFID USB] Ignore empty {direction} event")
                    buffer = ""
                    continue

                self._enqueue_event(direction, card_id)
                buffer = ""
            except SerialException:
                try:
                    if self._ser:
                        self._ser.close()
                except Exception:
                    pass
                self._ser = None
                time.sleep(self._config.retry_interval)
            except Exception:
                time.sleep(0.5)

    def _consume_loop(self) -> None:
        while self._running.is_set():
            try:
                direction, card_id, _ = self._event_queue.get(timeout=0.5)
            except Empty:
                continue

            try:
                self._on_rfid(direction, card_id)
            except Exception:
                pass


# (direction, card_id, lot_id) -> None. lot_id=None nghĩa là sự kiện đến từ cổng mặc
# định (không gán riêng cho bãi nào) - ingest_rfid_event sẽ tự fallback về bãi active
# đầu tiên (_resolve_lot), giữ đúng hành vi cũ trước khi có nhiều đầu đọc.
RfidLotCallback = Callable[[str, str, "int | None"], None]


class RfidReaderManager:
    """Quản lý NHIỀU RfidUsbReader cùng lúc - 1 cổng "mặc định" (global, từ .env, dùng
    chung cho các bãi KHÔNG gán cổng riêng) + N cổng riêng theo từng bãi
    (ParkingLot.rfid_usb_port). Quẹt thẻ ở cổng riêng của bãi nào thì event mang đúng
    lot_id đó - không còn phải đoán/luôn rơi về bãi đầu tiên như khi chỉ có 1 cổng
    global. Đồng bộ động khi bãi được tạo/sửa/xóa qua upsert_lot/remove_lot, cùng
    pattern với CameraStreamManager.upsert_camera/set_enabled/remove_camera.

    Cùng 1 cổng vật lý không được mở 2 lần từ 2 thread khác nhau (OS sẽ báo lỗi "port
    busy" hoặc gây đọc chồng dữ liệu không xác định) - nếu cổng mặc định trùng với cổng
    1 bãi đã gán riêng, reader mặc định tự dừng nhường cổng đó cho reader của bãi.
    """

    def __init__(
        self,
        db_session_factory,
        event_handler: RfidLotCallback,
        default_port: str,
        baudrate: int,
        queue_max_size: int,
        enabled: bool,
    ) -> None:
        self._db_session_factory = db_session_factory
        self._event_handler = event_handler
        self._default_port = (default_port or "").strip()
        self._baudrate = baudrate
        self._queue_max_size = queue_max_size
        self._enabled = enabled
        self._lock = threading.Lock()
        self._lot_readers: dict[int, RfidUsbReader] = {}
        self._lot_ports: dict[int, str] = {}
        self._default_reader: RfidUsbReader | None = None

    def _make_config(self, port: str) -> RfidUsbConfig:
        return RfidUsbConfig(port=port, baudrate=self._baudrate, queue_max_size=self._queue_max_size, enabled=True)

    def _start_lot_reader(self, lot_id: int, port: str) -> None:
        reader = RfidUsbReader(
            self._make_config(port),
            lambda direction, card_id, _lot_id=lot_id: self._event_handler(direction, card_id, _lot_id),
        )
        with self._lock:
            self._lot_readers[lot_id] = reader
            self._lot_ports[lot_id] = port
        reader.start()
        print(f"[RFID MANAGER] Bãi #{lot_id}: đầu đọc riêng trên cổng {port}")

    def _stop_lot_reader(self, lot_id: int) -> None:
        with self._lock:
            reader = self._lot_readers.pop(lot_id, None)
            self._lot_ports.pop(lot_id, None)
        if reader:
            reader.stop()

    def _default_port_claimed(self) -> bool:
        with self._lock:
            return self._default_port in self._lot_ports.values()

    def _refresh_default_reader(self) -> None:
        should_run = bool(self._default_port) and not self._default_port_claimed()
        running = self._default_reader is not None
        if should_run and not running:
            self._default_reader = RfidUsbReader(
                self._make_config(self._default_port),
                lambda direction, card_id: self._event_handler(direction, card_id, None),
            )
            self._default_reader.start()
        elif not should_run and running:
            self._default_reader.stop()
            self._default_reader = None
            if self._default_port:
                print(
                    f"[RFID MANAGER] Cổng mặc định {self._default_port} đã được 1 bãi "
                    "gán riêng - dừng reader mặc định để tránh mở trùng cổng"
                )

    def start(self) -> None:
        if not self._enabled:
            print("[RFID MANAGER] Disabled by config (RFID_USB_ENABLED=false)")
            return
        with self._db_session_factory() as db:
            lots: list["ParkingLot"] = list(db.scalars(select(_parking_lot_model())).all())
        for lot in lots:
            port = (lot.rfid_usb_port or "").strip()
            if port:
                self._start_lot_reader(lot.id, port)
        self._refresh_default_reader()

    def shutdown(self) -> None:
        with self._lock:
            lot_ids = list(self._lot_readers.keys())
        for lot_id in lot_ids:
            self._stop_lot_reader(lot_id)
        if self._default_reader:
            self._default_reader.stop()
            self._default_reader = None

    def upsert_lot(self, lot: "ParkingLot") -> None:
        if not self._enabled:
            return
        self._stop_lot_reader(lot.id)
        port = (lot.rfid_usb_port or "").strip()
        if port:
            self._start_lot_reader(lot.id, port)
        self._refresh_default_reader()

    def remove_lot(self, lot_id: int) -> None:
        if not self._enabled:
            return
        self._stop_lot_reader(lot_id)
        self._refresh_default_reader()


def _parking_lot_model():
    # Import trễ để tránh vòng import (parking_lots.model không phụ thuộc ngược lại
    # service này, nhưng module rfid_usb_reader được import rất sớm trong lifespan).
    from app.modules.parking_lots.model import ParkingLot

    return ParkingLot
