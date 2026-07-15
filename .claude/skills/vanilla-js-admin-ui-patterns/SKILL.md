---
name: vanilla-js-admin-ui-patterns
description: UI/UX patterns for a no-framework, no-bundler vanilla-JS admin panel (ES modules only) - safe HTML templating, toast/notification systems, token-authenticated <img>/WebSocket resources, and responsive layout without a CSS framework. Use when building or extending a plain-JS dashboard/admin UI.
---

# Vanilla-JS admin panel UI/UX patterns

Real project: SmartCarParking's frontend is plain ES modules (`frontend/renderer/js/`)
with no build step, no framework, no bundler — these are the patterns that held up
well across a large surface (parking lots, cameras, RFID, sessions, snapshots).

## Escape at the render boundary, once, shared

Every table row built via `element.innerHTML = \`<td>${value}</td>\`` is a stored-XSS
risk the moment `value` can contain user-authored text (names, free-text IDs, owner
fields). The fix that scales across many view files without framework-level
auto-escaping:

```js
const HTML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}
```

One shared helper in the common `ui.js` module, imported everywhere a template
literal interpolates a user-controlled field into `innerHTML` — including inside HTML
*attributes* (`data-card-id="${escapeHtml(card.card_id)}"`), which is just as
exploitable via attribute-breakout as tag injection. Fields set via `.textContent`
instead of `.innerHTML` never need this (the DOM API escapes automatically) — audit
by finding every `innerHTML = \`` first, `.textContent` assignments are already safe.

Escape at **display time**, not at write/storage time: the same raw value is often
rendered in more than one view (a lot name shows up in the lots table, the dashboard
occupancy list, and the snapshot filter) — sanitizing once at write bakes in an
assumption about how it'll be shown everywhere, and if you ever need the raw value
(an API response, a CSV export) you don't want it pre-mangled.

## Toast/notification system: two independent channels, not one

A single "notice bar" struggles to serve both "background poll succeeded/failed"
(low-urgency, ambient) and "a physical RFID card was just scanned" (needs to grab
attention immediately, possibly while the user is looking at a different tab/view).
Keep these as two separate, independently-styled UI elements:
- A persistent notice bar (`notify(message, type)`) for ambient status, auto-clearing
  after ~3s except for `error` type (stays until the next event).
- A distinct "scan tick" toast (`showScanTick(message)`), fixed-position, that
  animates in/out on its own short timer, reserved for real-time physical-world
  events the user needs to notice even if they're not looking at that exact panel.

Deduplicate anything driven by polling (not by a live push): if a background poll
re-fetches the last N log rows every few seconds, the same "card scanned" event will
appear in multiple poll responses until it ages out of the window — track a
`Set<string>` of already-toasted event keys (e.g. `` `${type}:${cardId}:${timestamp}` ``)
so the same physical event doesn't re-toast every poll cycle.

## Resources a browser can't attach an Authorization header to

`<img src>`, `<a href>` for direct downloads, and `new WebSocket(url)` all issue
requests the page cannot add custom headers to. Once the backend requires auth on
these (see the security-audit skill for why it should), the frontend fix is a query
param, centralized in one helper per resource type so no call site can forget it:

```js
// images/downloads
function withToken(url) {
  const token = getToken();
  return token ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : url;
}
// websockets
export function wsCameraUrl(cameraId) {
  const token = getToken();
  const base = `${WS_BASE}/ws/cameras/${cameraId}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
```

Route every construction of these URLs through the helper — grep for the raw
`WS_BASE`/API base concatenation pattern after adding the helper to make sure no call
site was missed (a leftover raw construction is a silent 401 that's easy to miss
until someone notices a broken image).

## Cache-busting for anything that can go stale mid-session

Snapshot images referenced by path can be re-captured under the same or a
predictable-looking URL; append `?_ts=${Date.now()}` for any image the user expects
to see update live (a "latest capture" panel) — without it the browser's HTTP cache
happily shows last week's photo forever. Apply the same idea to `GET` API calls that
must never serve a stale cached response (`Cache-Control: no-cache`, plus a `_ts`
query param as a belt-and-suspenders measure against overly aggressive intermediary
caches).

## Diagnosing "it works in my edit but not in the browser"

The single most common false lead when a UI change "isn't showing up": a stale build
artifact, not a logic bug. Before debugging application logic, diff what's actually
being served against the source file:

```bash
diff <(curl -s http://localhost:5173/js/views/parking.js) frontend/renderer/js/views/parking.js
```

If this reports a difference, the fix is rebuilding/restarting the serving container,
not more code changes. Get in the habit of running this diff as the *first* check
whenever a just-shipped frontend change doesn't appear to take effect — it's a 5-second
check that rules out an entire class of wasted debugging.
