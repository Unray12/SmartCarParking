Ho tro 2 bus I2C cho module RFID I2C.

Quy uoc su dung:
- `I2C1` la bus `default` cua board, van duoc dung qua bien `rfid`.
- `I2C2` la bus `extend` cho phep chon chan Digital de lam `SCL` va `SDA`.
- Truoc khi dung `I2C2`, can goi `configure_i2c2(...)` hoac `set_i2c2_pins(...)`.

Vi du voi Python:

```python
from rfid import *

print(rfid.scan_card())

configure_i2c2("D3", "D4")
rfid_2 = get_rfid(2)
print(rfid_2.scan_card())
```

Vi du voi chan da co san trong firmware:

```python
from rfid import *

configure_i2c2(D3, D4)
rfid_2 = get_rfid("I2C2")
print(rfid_2.scan_card())
```
