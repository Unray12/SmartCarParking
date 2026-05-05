from __future__ import annotations

import asyncio
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


RFID_PATTERN = re.compile(r"\{(in|out):\s*([0-9A-Fa-f:]+)\}")


@dataclass
class RfidUsbConfig:
    port: str = "/dev/ttyUSB0"
    baudrate: int = 9600
    timeout: float = 0.5
    retry_interval: float = 3.0
    enabled: bool = True


RfidCallback = Callable[[str, str], None]  # (direction, card_id) -> None


class RfidUsbReader:
    def __init__(self, config: RfidUsbConfig, on_rfid: RfidCallback) -> None:
        self._config = config
        self._on_rfid = on_rfid
        self._running = threading.Event()
        self._thread: threading.Thread | None = None
        self._ser: serial.Serial | None = None

    def start(self) -> None:
        if not self._config.enabled or serial is None:
            return
        if self._thread and self._thread.is_alive():
            return
        self._running.set()
        self._thread = threading.Thread(target=self._run, daemon=True, name="rfid-usb-reader")
        self._thread.start()

    def stop(self) -> None:
        self._running.clear()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        self._thread = None
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
            return True
        except (SerialException, OSError):
            self._ser = None
            return False

    def _run(self) -> None:
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
                if card_id:
                    try:
                        self._on_rfid(direction, card_id)
                    except Exception:
                        pass
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
