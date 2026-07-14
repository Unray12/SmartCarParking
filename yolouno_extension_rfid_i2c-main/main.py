"""
Main cho YoloUNO (ESP32, OhStem/AIoT VN) - 1 board gan 2 cam bien RFID I2C
13.56MHz (1 cong VAO + 1 cong RA), doc lien tuc va gui su kien qua Serial
(USB) dung dinh dang backend dang parse (xem
backend/app/services/rfid_usb_reader.py, RFID_PATTERN):

    {in: <card_id>}   hoac   {out: <card_id>}

Vi du thuc te: {in: 8E:68:B9:06}

2 cam bien dung 2 bus I2C rieng cua extension nay (xem readme.md):
  - Cam bien CONG VAO -> I2C1 (bus mac dinh cua board, tu nhan chan, khong
    can khai bao - da co san qua bien `rfid`).
  - Cam bien CONG RA  -> I2C2 (bus mo rong, PHAI khai bao chan SCL/SDA qua
    configure_i2c2() truoc khi dung - xem EXIT_SCL_PIN/EXIT_SDA_PIN ben duoi).

QUAN TRONG: doi EXIT_SCL_PIN / EXIT_SDA_PIN cho dung voi chan ban da noi day
thuc te cho cam bien cong ra tren board.

Khong dung ky tu tieng Viet co dau trong cac print() ben duoi - de tranh loi
encode khi xem qua serial monitor tren Windows (da gap bug tuong tu ben
backend, xem CONTEXT.md).
"""

from rfid import *
from time import sleep_ms

# Chan cho cam bien CONG RA (I2C2 - bus mo rong). Cam bien CONG VAO dung I2C1
# (bus mac dinh) nen khong can khai bao chan o day.
EXIT_SCL_PIN = "D3"
EXIT_SDA_PIN = "D4"

# Khoang cach giua 2 lan doc the (ms) - dung chung cho ca 2 cam bien.
POLL_INTERVAL_MS = 200


def main():
    configure_i2c2(EXIT_SCL_PIN, EXIT_SDA_PIN)
    rfid_in = rfid              # I2C1 (bus mac dinh) - cam bien cong VAO
    rfid_out = get_rfid("I2C2")  # I2C2 (bus mo rong) - cam bien cong RA

    print("RFID reader started: IN=I2C1, OUT=I2C2 (pins %s/%s)" % (EXIT_SCL_PIN, EXIT_SDA_PIN))

    # Theo doi the dang nam truoc moi dau doc de chi gui 1 su kien cho moi
    # lan CHAM the - neu khong debounce, giu the lau se gui lap lai lien tuc,
    # spam serial va tao nhieu ban ghi RFID trung nhau o backend. 2 cam bien
    # debounce doc lap nhau.
    last_in = None
    last_out = None

    while True:
        try:
            card_in = rfid_in.scan_card()
        except Exception as exc:
            print("RFID IN read error: %s" % exc)
            card_in = ""

        try:
            card_out = rfid_out.scan_card()
        except Exception as exc:
            print("RFID OUT read error: %s" % exc)
            card_out = ""

        if card_in:
            if card_in != last_in:
                print("{in: %s}" % card_in)
                last_in = card_in
        else:
            # The da roi khoi dau doc -> lan cham tiep theo (du cung the)
            # duoc tinh la 1 su kien moi.
            last_in = None

        if card_out:
            if card_out != last_out:
                print("{out: %s}" % card_out)
                last_out = card_out
        else:
            last_out = None

        sleep_ms(POLL_INTERVAL_MS)


main()
