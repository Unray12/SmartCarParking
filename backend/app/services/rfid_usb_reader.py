from __future__ import annotations

from queue import Empty, Full, Queue
import re
import threading
import time
from dataclasses import dataclass
from typing import Callable

try:
    import serial
    from serial.serialutil import SerialException
except ImportError:
    serial = None  # type: ignore[assignment]


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
