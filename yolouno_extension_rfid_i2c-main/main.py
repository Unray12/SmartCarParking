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
from time import sleep_ms, ticks_ms, ticks_diff

# Chan cho cam bien CONG RA (I2C2 - bus mo rong). Cam bien CONG VAO dung I2C1
# (bus mac dinh) nen khong can khai bao chan o day.
EXIT_SCL_PIN = "D3"
EXIT_SDA_PIN = "D4"

# Khoang cach giua 2 lan doc the (ms) - dung chung cho ca 2 cam bien. Giam tu 200ms
# xuong 60ms de giam do tre "cho giua 2 lan doc" (phan cong voi do tre rieng cua ban
# than 1 lan doc I2C - xem _read_card ben duoi).
POLL_INTERVAL_MS = 60

# Debounce theo THOI GIAN (khac ban cu chi debounce theo "the con nam tren dau doc"):
# trong DEBOUNCE_MS ke tu lan GUI gan nhat, cung 1 the_id se KHONG gui lai du gap doc
# rong 1-2 nhip o giua (tiep xuc I2C chap chon lam mat presence tam thoi roi doc lai
# ngay) - ban cu bi loi nay: chi can 1 nhip doc rong la reset debounce, doc lai thanh
# cong ngay sau do bi hieu nham la "the moi" -> gui trung su kien len backend.
DEBOUNCE_MS = 1000


def _read_card(rfid_sensor):
    """Doc 1 lan the qua readTagID() TRUC TIEP (thay vi scan_card() cua thu vien).
    scan_card() = tagPresent() + readID() -> khi CO the ap sat dau doc, ham nay goi
    readTagID() 2 LAN (1 lan qua tagPresent kiem tra su hien dien, 1 lan qua readID
    lay lai id) - gap doi so round-trip I2C dung luc quan trong nhat (dang co the
    that, nguoi dung dang doi phan hoi). readTagID() da tra ve san ca presence lan id
    trong 1 lan goi nen chi can goi DUY NHAT 1 lan la du - giam ~1 nua thoi gian doc
    cho truong hop co the (truong hop khong co the van phai cho ben trong readTagID()
    nhu cu, khong doi duoc tu file main nay vi khong sua rfid.py)."""
    result = rfid_sensor.readTagID()
    return result['id_formatted'] if result['success'] else ""


def main():
    configure_i2c2(EXIT_SCL_PIN, EXIT_SDA_PIN)
    rfid_in = rfid              # I2C1 (bus mac dinh) - cam bien cong VAO
    rfid_out = get_rfid("I2C2")  # I2C2 (bus mo rong) - cam bien cong RA

    print("RFID reader started: IN=I2C1, OUT=I2C2 (pins %s/%s)" % (EXIT_SCL_PIN, EXIT_SDA_PIN))

    last_in = None
    last_in_ts = 0
    last_out = None
    last_out_ts = 0

    while True:
        try:
            card_in = _read_card(rfid_in)
        except Exception as exc:
            print("RFID IN read error: %s" % exc)
            card_in = ""

        try:
            card_out = _read_card(rfid_out)
        except Exception as exc:
            print("RFID OUT read error: %s" % exc)
            card_out = ""

        now = ticks_ms()

        # Gui khi: the KHAC lan gui truoc (luon gui ngay, khong cho debounce chan the
        # moi) HOAC cung the nhung da qua DEBOUNCE_MS ke tu lan gui truoc (cho phep
        # quet lai that su sau khi da du lau, khong phai do doc rong gian doan).
        if card_in and (card_in != last_in or ticks_diff(now, last_in_ts) >= DEBOUNCE_MS):
            print("{in: %s}" % card_in)
            last_in = card_in
            last_in_ts = now

        if card_out and (card_out != last_out or ticks_diff(now, last_out_ts) >= DEBOUNCE_MS):
            print("{out: %s}" % card_out)
            last_out = card_out
            last_out_ts = now

        sleep_ms(POLL_INTERVAL_MS)


main()
