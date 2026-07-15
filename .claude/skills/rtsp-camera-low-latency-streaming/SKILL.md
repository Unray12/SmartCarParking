---
name: rtsp-camera-low-latency-streaming
description: Design and tune a low-latency RTSP/IP-camera -> WebSocket -> browser streaming pipeline with OpenCV+FFmpeg. Use when a camera preview feels laggy, frames pile up, RTSP connects locally but not in Docker, or you need a capture/encode/infer threading model that never blocks on the slowest stage.
---

# RTSP camera low-latency streaming

Real project this came from: SmartCarParking's `CameraStreamManager`/`CameraWorker`
(`backend/app/services/camera_stream.py`) + WS endpoint
(`backend/app/modules/cameras/controller.py`) + browser canvas consumer
(`frontend/renderer/js/camera.js`, `views/parking.js`). Delay went from a laggy,
unmeasured baseline to a documented ~1.2s glass-to-glass, then further reduced.

## Core principle: never queue frames, always overwrite "latest"

The #1 source of creeping/compounding latency in a camera pipeline is a **FIFO queue
between any two stages**. If the consumer is ever slower than the producer even once,
a queue means it now displays an increasingly-stale frame forever (it must drain the
backlog before catching up, and usually never does). The fix used everywhere in this
pipeline: **each stage only ever holds the single most recent item**, protected by a
lock, identified by a monotonically increasing sequence number so downstream can tell
"is this newer than what I already sent/drew?".

```
capture thread --frame_lock--> latest_frame_bgr (+seq)
encode thread  --lock-->        latest_jpeg (+seq)
WS send loop   -- only sends if seq > last_seq_sent --> browser
browser        -- pendingFrame overwritten, never appended --> decode+draw
```

Three independent threads per camera (`_capture_loop`, `_encode_loop`, `_infer_loop`),
each polling the previous stage's "latest" value rather than being pushed to via a
queue. AI inference runs on its own thread with a `maxsize=1` queue that is drained
and refilled (never blocks capture, never backs up — see `_submit_infer_frame`).
Same overwrite pattern on the frontend: `focusRuntime.pendingFrame = ev.data` (plain
assignment, not `.push()`), decoded via `requestAnimationFrame` guarded by a
`decoding` flag so a slow decode never causes a backlog of pending frames either.

## RTSP-specific gotchas

- **`rtsp_transport=tcp` as a URL query string does nothing.** `?rtsp_transport=tcp`
  is silently ignored by FFmpeg's RTSP demuxer — it is an AVOption, not a URL param.
  It must go through `OPENCV_FFMPEG_CAPTURE_OPTIONS` (an env var OpenCV's FFmpeg
  backend reads at `VideoCapture` open time): `os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"]
  = "rtsp_transport;tcp|..."`. Getting this wrong means the transport silently stays
  UDP no matter what you configure.
- **UDP + Docker Desktop on Windows (WSL2/Hyper-V NAT) times out ~30s** (conntrack UDP
  timeout) even though the exact same UDP stream works fine bare-metal outside Docker.
  Force TCP transport when running the RTSP client inside a container on Windows.
- **`OPENCV_FFMPEG_CAPTURE_OPTIONS` keys cannot repeat.** OpenCV parses this into an
  FFmpeg `av_dict` via repeated `av_dict_set(key, value)` calls — a duplicate key
  **overwrites** the earlier one, it does not merge. `fflags;nobuffer|...|fflags;discardcorrupt`
  silently drops `nobuffer` (arguably the most important flag for latency) because the
  second `fflags` entry replaces the first. Combine multi-flag options with `+`:
  `fflags;nobuffer+discardcorrupt`. This is an easy, silent, hard-to-notice bug —
  grep any FFmpeg options string for duplicate keys before trusting it.
- **`max_delay`** (µs) is the single highest-leverage latency knob for RTSP demuxing —
  it's how long FFmpeg holds packets waiting to interleave/reassemble before handing a
  frame back. Defaults seen in the wild (500ms-1s) are often way more conservative than
  needed. Lowering it (e.g. to 100ms) trades network-jitter tolerance for latency —
  document this trade-off explicitly for whoever tunes it later, and expose it as an
  env var, not a hardcoded constant, so it can be dialed back up without a rebuild if a
  specific camera's network is flaky.
- **`cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)` is a hint, not a guarantee** for the FFmpeg
  backend on network streams — don't rely on it alone to prevent backlog; combine with
  the grab-draining pattern below when you actually need it.

## Backlog-draining ("skip grabs") — powerful but conditionally safe

Pattern: after a successful `cap.grab()`, do N more `cap.grab()` calls (discarding
them) before `cap.retrieve()`, to jump past frames that piled up in the OS
socket/FFmpeg internal buffer while your loop was busy elsewhere — decode/display the
*freshest* frame, not the oldest queued one.

**This is only safe when the source has a genuine backlog to drain** (a real RTSP
camera continuously pushing frames faster than you consume them). Verified by direct
testing: enabling this against a source with **no backlog** (a single static image
served once, or in general a slow/on-demand HTTP-MJPEG source) makes the extra
`grab()` fail (EOF/no-new-frame), and that failure can make `retrieve()` fail too —
net result is **frames stop arriving entirely**, not just "slightly less smooth".
Concretely:

```python
# WRONG: unconditional extra grabs — return value discarded, corrupts retrieve()
# on any source without a real backlog.
for _ in range(skip_grabs):
    cap.grab()
ok, frame = cap.retrieve()

# BETTER: stop the moment a grab fails — still retrieve() the last good frame,
# degrades gracefully on sources with no backlog instead of losing the frame.
for _ in range(skip_grabs):
    if not cap.grab():
        break
ok, frame = cap.retrieve()
```

Even with the graceful version, a source that hits a hard EOF (not just "no new frame
yet") can leave `retrieve()` unable to recover the previously-grabbed frame — this is
implementation-specific decoder state, not something you can fully paper over in
Python. **Keep this feature opt-in and defaulted OFF** (`capture_skip_grabs=0`) unless
the deployment is confirmed to be a continuously-pushing RTSP camera; document the
failure mode in the config comment so a future tuner doesn't get bitten blind.

## Reconnect loop shape (handles camera reboot, network blip, wrong password, etc.)

```python
while running:
    if cap is None or not cap.isOpened():
        cap = open_capture()  # sets OPENCV_FFMPEG_CAPTURE_OPTIONS, BUFFERSIZE, timeouts
        if not cap or not cap.isOpened():
            sleep(backoff); backoff = min(backoff * 1.6, cap_max); continue
        backoff = base  # reset only on a successful (re)open
    if not cap.grab():
        failures += 1
        if failures < N: sleep(short); continue      # transient hiccup, don't reconnect
        cap.release(); cap = None; sleep(backoff); backoff *= growth; continue
    ok, frame = cap.retrieve()
    ...
```

Key details worth keeping: exponential backoff capped at a sane ceiling (here 1.5s),
a small tolerance window before treating a grab failure as "reconnect" rather than
"transient" (avoids reconnect storms on 1-2 dropped packets), and resetting backoff
only on a **successful** reopen (not merely attempting one).

## Testing this kind of pipeline without a real camera

A `python -m http.server` serving a single static JPEG, opened via
`cv2.VideoCapture(url, cv2.CAP_FFMPEG)`, is a decent stand-in for **one-shot capture**
testing (verifying AI inference on a frame, verifying a snapshot gets saved) — but it
is a poor stand-in for **continuous streaming/backlog behavior**: the image2 demuxer
hits true EOF after 1 frame, which is a fundamentally different failure mode than a
live camera's "no new packet yet, but the stream is still open" state. Don't draw
conclusions about backlog-draining or sustained-throughput behavior from this kind of
substitute source — it will pass/fail for reasons unrelated to how it behaves against
a real camera. When the real camera isn't reachable (VPN/network-dependent), say so
explicitly rather than presenting a synthetic-source test as proof of real-world
latency.

## WebSocket delivery layer

- No auth header from a browser `new WebSocket(url)` call — pass a short-lived token
  via query string (`?token=...`) and validate it **before** `websocket.accept()`
  (`await websocket.close(code=1008)` if invalid — this surfaces as an HTTP 403 at
  handshake time to the client, never establishing the connection).
- Tight poll loop (`asyncio.sleep(0.002)`) gated by `min_interval = 1/target_fps` is
  fine and adds negligible latency (2ms granularity vs a 40ms frame interval) — don't
  over-engineer this side with pub/sub machinery for a single-camera-per-connection
  use case.
- Send only when `seq > last_seq_sent` — this is what prevents re-sending the same
  frame repeatedly when the source is temporarily slower than the poll rate.
