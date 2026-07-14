"""
Script nho de test dau doc RFID qua cong COM (Windows) - chi doc serial va in ra
man hinh, khong phu thuoc gi vao backend. Dung de kiem tra nhanh dau doc co gui
dung dinh dang app dang parse hay khong: `{in: <card_id>}` / `{out: <card_id>}`
(xem backend/app/services/rfid_usb_reader.py).

Cai dat (neu chua co):
    pip install pyserial

Chay:
    python testRFID.py            # se hoi/chon cong COM
    python testRFID.py COM5       # chi dinh cong COM truc tiep
    python testRFID.py COM5 9600  # chi dinh ca baudrate (mac dinh 115200)

Luu y: KHONG dung ky tu co dau trong cac print() ben duoi - console Windows mac
dinh (cp1252) hay bi UnicodeEncodeError voi ky tu tieng Viet co dau (da gap bug
nay trong backend, xem CONTEXT.md).
"""

import re
import sys
import time

import serial
import serial.tools.list_ports

RFID_PATTERN = re.compile(r"\{(in|out):\s*([0-9A-Fa-f:]*)\}")

DEFAULT_BAUDRATE = 115200


def list_available_ports() -> list[str]:
    ports = [p.device for p in serial.tools.list_ports.comports()]
    if ports:
        print("Cac cong COM dang co:")
        for p in ports:
            print(f"  - {p}")
    else:
        print("Khong tim thay cong COM nao dang ket noi.")
    return ports


def choose_port() -> str:
    ports = list_available_ports()
    if len(ports) == 1:
        print(f"Tu chon cong duy nhat: {ports[0]}")
        return ports[0]
    return input("Nhap ten cong COM (vi du COM5): ").strip()


def main() -> None:
    port = sys.argv[1] if len(sys.argv) > 1 else choose_port()
    baudrate = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_BAUDRATE

    print(f"\nDang mo {port} @ {baudrate} baud... (Ctrl+C de dung)\n")
    try:
        ser = serial.Serial(port=port, baudrate=baudrate, timeout=1)
    except serial.SerialException as exc:
        print(f"Khong mo duoc cong {port}: {exc}")
        return

    try:
        while True:
            raw = ser.readline()
            if not raw:
                continue  # het timeout, chua co du lieu moi

            text = raw.decode("utf-8", errors="replace").strip()
            if not text:
                continue

            stamp = time.strftime("%H:%M:%S")
            print(f"[{stamp}] RAW: {text}")

            match = RFID_PATTERN.search(text)
            if match:
                direction, card_id = match.group(1), match.group(2)
                print(f"           -> direction={direction}, card_id={card_id or '(rong)'}")
    except KeyboardInterrupt:
        print("\nDa dung theo yeu cau (Ctrl+C).")
    finally:
        ser.close()


if __name__ == "__main__":
    main()
