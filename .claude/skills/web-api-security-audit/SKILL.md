---
name: web-api-security-audit
description: Methodology for auditing a small-to-medium web app's auth/authz surface, finding account-takeover and stored-XSS bugs, and fixing them without breaking legitimate flows (browser <img>/WebSocket can't send auth headers, "forgot password" needs some usable UX, etc). Use when asked to review or fix security vulnerabilities in a web app.
---

# Web API security audit methodology

Real project: a FastAPI + vanilla-JS admin panel audit that found a fully public
password-reset endpoint (instant account takeover), unauthenticated live camera feeds,
no brute-force protection, and stored XSS across several tables — then fixed all of it
without breaking the legitimate UX each feature existed for. Verified every fix live
(curl, a real WebSocket client, DB round-trips), not just by reading the code.

## Step 1: find the REAL auth boundary, not the per-function signature

Grepping controller files for `Depends(get_current_user)` per-endpoint can be
**completely misleading** if the app protects routes at the router-inclusion level
instead:

```python
_auth = [Depends(get_current_user)]
api_v1.include_router(cameras_router, dependencies=_auth)   # protected here,
                                                              # not in cameras/controller.py
```

Always find where routers get `include_router`'d and check for a `dependencies=`
kwarg there before concluding an endpoint is unprotected. Conversely, this is also
where you find the **intentionally public list** — read it fully, and audit each
entry on its own merits rather than assuming "public" was a deliberate, sound decision
just because it's documented as such in a comment.

## Step 2: the account-recovery endpoint is almost always the sharpest edge

A "reset password" or "forgot password" endpoint that exists to be usable *before*
login is structurally in tension with authentication — by definition it can't require
a valid token. The question to always ask: **what actually proves the caller is who
they claim to be?** If the answer is "nothing, we just haven't wired up OTP/email
yet" (a `# TODO: replace with OTP later` comment is a strong tell), that endpoint lets
anyone who knows a username (often a documented default like `admin`) take over the
account instantly, from anywhere reachable.

Fixes, in order of preference:
1. Real identity verification (email/SMS OTP) — the correct long-term fix.
2. If that infra doesn't exist yet and the feature's UX must keep working (e.g. an
   operator standing at a physical on-site NUC who genuinely forgot the password),
   **gate by network origin** instead of by credential: only allow the call from a
   private/loopback source IP (`ipaddress.ip_address(host).is_private or .is_loopback`).
   This preserves the exact existing "type username, get a fresh password, log in"
   flow for the deployment's real threat model (on-prem/LAN appliance) while closing
   the "anyone on the internet" hole. Document the trade-off in the code: this does
   NOT stop a malicious actor already on the same LAN — call that out explicitly
   rather than implying the fix is complete.
3. Requiring an existing valid session (`Depends(get_current_user)`) is the "safest"
   fix on paper but **silently breaks the forgot-password-from-the-login-page flow**
   — check whether the frontend actually calls this endpoint while logged out before
   applying this fix; if it does, this "fix" just replaces one broken UX with another.

Always add rate limiting alongside whichever gate you pick — even a same-LAN or
authenticated actor shouldn't get unlimited guesses.

## Step 3: media endpoints that "have to" be public usually don't

A common justification for leaving an endpoint unauthenticated: "the browser can't
attach an Authorization header here" — true for `<img src>`, `<a href>`, and
`new WebSocket(url)`. The fix is **not** to make the endpoint public; browsers can
absolutely put a token in the **query string**, which the server can validate exactly
like a header:

```python
def get_current_user_flexible(request: Request, credentials=Depends(bearer)) -> str:
    token = credentials.credentials if credentials else request.query_params.get("token")
    if not token: raise UNAUTHORIZED
    ...
```

For WebSocket specifically, validate the token **before** `websocket.accept()` and
`close()` (not just refuse to send data after accepting) — an unauthenticated caller
should never get a successful handshake at all. Frontend-side: append
`?token=<jwt>` when constructing every such URL — centralize this in one helper
(`wsCameraUrl()`, `absoluteApiUrl()`) rather than at each call site, so the auth
requirement can't be silently missed on the next new call site.

## Step 4: brute force — a simple in-memory limiter is enough for a single-instance app

Don't reach for Redis/external infra to rate-limit login on an app that runs as one
process. A dict of `key -> list[timestamp]`, pruned to a sliding window, is sufficient:

```python
def check_rate_limit(key: str):
    now = time.monotonic()
    attempts = [t for t in log[key] if t >= now - WINDOW]
    if len(attempts) >= MAX: raise HTTPException(429)
    attempts.append(now); log[key] = attempts
```

Resetting on process restart is an acceptable trade-off for this scale — say so
explicitly in a comment so nobody "fixes" it into unnecessary complexity later.

## Step 5: stored XSS — find every `innerHTML` template that interpolates user text

Grep for `innerHTML = \`` across the frontend, then for each hit check whether any
interpolated field came from user-controllable input (names, free-text IDs, owner
fields — NOT server-computed enums/booleans/IDs, which don't need escaping). Common
places a schema `Field(max_length=N)` with no charset restriction quietly allows
`<script>`/attribute-breakout payloads through:
- Entity/resource names (parking lot name, camera name)
- Free-text identifiers a user types into a test/manual-entry form (RFID card ID,
  owner name) — even if the *real* hardware path only ever sends safe values, a manual
  entry form for the same field is a live injection point
- Any field displayed in more than one view (dashboard AND history AND detail panel)
  — fix the shared escaping helper once, then re-grep for every place that field is
  rendered; it's easy to fix one table and miss a second one showing the same data.

Fix at the render/output boundary with one small shared helper (`escapeHtml`), not by
sanitizing on write — the same raw value is legitimately rendered in multiple views
and contexts, sanitize-on-write bakes in an assumption about how it'll be displayed
everywhere it's ever used.

## Step 6: verify every fix live, not just by reading the diff

- Auth fixes: actually call the endpoint with and without a token/from a plausible
  and implausible network origin, confirm both the allow and deny paths.
- Rate limits: actually hit the endpoint past the threshold and confirm the 429, then
  confirm it clears after the window (don't just trust the math).
- XSS fixes: actually submit a payload through the real API and confirm what gets
  escaped where — and immediately clean up test data afterward, especially if a test
  call has a real side effect (e.g. testing an unauthenticated password-reset
  endpoint literally changes the password — restore it immediately after confirming
  the behavior, before doing anything else).
- WebSocket auth: a plain HTTP client can't test this — use an actual WS client
  library to confirm the handshake is rejected/accepted correctly.

## Step 7: know what NOT to "fix"

Not every finding has a good code fix; forcing one can do more harm than the finding
itself:
- SSRF via a "camera source URL" pointing at a private IP is usually **the entire
  point of the feature** (cameras live on the LAN) — blocking private IPs breaks the
  product. Flag it as an accepted risk tied to the authenticated-only nature of that
  feature, don't half-fix it with a private-IP blocklist that breaks real use.
- Running a container as root is worth flagging, but switching to a non-root user
  when the app writes to bind-mounted host directories can silently break file
  permissions in a way you can't verify without testing on the actual target host —
  don't ship that change un-verified; recommend it with the specific caveat instead.
