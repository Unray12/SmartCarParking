# Skills learned on SmartCarParking

Notes captured from real work on this project, written so they're reusable on other
projects — not a changelog of what happened here, but the transferable technique.
Each skill is a `SKILL.md` Claude can invoke by name in a future session; open any of
them directly to read as plain documentation too.

## ⭐ Flagship: [rtsp-camera-low-latency-streaming](rtsp-camera-low-latency-streaming/SKILL.md)
The most detailed one, by request. Covers the full capture → encode → infer → WS →
canvas pipeline: the "never queue, always overwrite latest" principle that runs
through every stage, the RTSP-over-Docker transport gotchas, the FFmpeg
duplicate-option-key bug that silently drops `nobuffer`, and — importantly — a
documented case where an optimization (`capture_skip_grabs`) was tried, verified to
regress on non-RTSP sources via live testing, and reverted rather than shipped
half-checked.

## System design
- [docker-multi-layer-config](docker-multi-layer-config/SKILL.md) — bare-metal vs
  Docker env-var architecture, `.dockerignore` secret-leakage verification, symmetric
  data-directory naming so bind mounts and native paths never diverge.

## Security
- [web-api-security-audit](web-api-security-audit/SKILL.md) — finding the real auth
  boundary (router-level, not per-endpoint), fixing an unauthenticated password-reset
  endpoint without breaking its legitimate UX, token-via-query-string for
  `<img>`/WebSocket, in-memory rate limiting, and a systematic stored-XSS sweep.

## Database
- [db-partial-index-hot-cold](db-partial-index-hot-cold/SKILL.md) — partial indexes
  as a lighter-weight alternative to physically splitting hot/cold data into separate
  tables, plus how to actually verify a query plan at realistic scale instead of
  trusting `CREATE INDEX` succeeded.

## UI/UX
- [vanilla-js-admin-ui-patterns](vanilla-js-admin-ui-patterns/SKILL.md) — safe HTML
  templating without a framework, a two-channel toast/notification system, and the
  "diff what's actually served vs the source file" first move whenever a frontend
  change appears not to take effect.
