---
name: docker-multi-layer-config
description: Design env-var/config architecture for an app that runs both bare-metal and in Docker Compose, without leaking secrets into images or confusing "same-looking" variables that actually serve different layers. Use when adding Docker support to an existing app, debugging why a container has stale/wrong config, or reviewing .dockerignore for secret leakage.
---

# Two-layer config architecture (bare-metal + Docker)

Real project: SmartCarParking has `backend/.env` (bare-metal, `DATABASE_URL` points at
`localhost`) and root `.env` (Docker Compose, `DATABASE_URL` built at runtime to point
at the `db` service hostname) — they look like duplicates but serve genuinely
different layers, and conflating them causes real bugs.

## The two layers are not the same "kind" of config

1. **App-level config** — what `backend/app/core/config.py`'s `Settings` (pydantic)
   reads: JWT secret, feature flags, model paths *relative to the app*, etc. This
   layer doesn't know or care whether it's running in a container.
2. **Infra-level config** — what `docker-compose.yml` substitutes into `${VAR}`
   references: host bind-mount paths, host port mappings, container networking
   hostnames. This layer doesn't know or care about the app's internals.

`docker-compose.yml`'s `env_file: .env` directive means the root `.env` does BOTH
jobs at once for the backend container: it fills `${VAR}` in the compose file AND
gets injected as the container's actual process environment. That dual role is why
root `.env` ends up looking like a copy of `backend/.env` — but a value like
`DATABASE_URL` **must differ** between the two files (`localhost` vs the Compose
service name `db`), so copy-pasting one into the other produces a config that looks
right and is wrong.

**Rule of thumb**: when a variable name shows up in both files, ask "does this value
need to differ depending on which network namespace the process is in?" before
assuming they should be kept identical.

## Docker Compose: which .env actually wins at runtime

`docker compose up` reads the root `.env` for two independent purposes — don't assume
whichever file you edited is the one that took effect:

- Variable substitution in `docker-compose.yml` itself (`${POSTGRES_DATA_DIR:-...}`)
  always comes from the root `.env` (or the shell environment, which overrides it —
  useful for a one-off `POSTGRES_PORT=15432 docker compose up` without touching the
  file).
- The `env_file:` directive injects that same root `.env` into the container's actual
  process environment — meaning `backend/.env` is **never read at all** when running
  via Compose (baking secrets into an image from `backend/.env` while the real answer
  comes from root `.env` is a common source of "I changed the config and nothing
  happened" bugs).

## `.dockerignore` and secret-baking — verify, don't assume

A build context's `.dockerignore` is the only thing standing between
`COPY backend/ backend/` and a secrets-laden image layer. Two failure modes seen in
practice:

- `backend/.env` (real secrets) gets copied into the image because `.dockerignore`
  only excluded the root `.env`, not the nested one. **Once baked into a layer, it
  stays there** even if a later commit deletes the file from the build context — the
  old layer persists in the image history unless you rebuild from scratch with no
  cache, or explicitly know that and treat that tag as compromised.
- The example/template file (`backend/.env.example`) must be explicitly
  un-ignored (`!backend/.env.example`) if the ignore pattern is a glob like
  `backend/.env*` — an `.example` file has genuinely no secrets and is useful
  documentation to ship, but a blanket glob will also catch it by accident.

**Verification habit**: after writing/editing `.dockerignore`, actually build the
image and `docker run --rm <image> find / -name '*.env*'` (or `docker history` +
inspect layers) rather than trusting the ignore file was written correctly by
inspection alone.

## Symmetric directory naming for bind mounts

When persisting data (DB, logs, snapshot images, model files) across container
rebuilds via bind mounts, use the **exact same relative directory names** the app
already uses natively for bare-metal runs (e.g. `data/snapshots_store`,
`data/models_store`), just nested one level under a common `data/` root. This means
`AI_MODELS_DIR`/`SNAPSHOT_STORE_DIR` (app-level, relative-to-app-root paths) and
`MODELS_DIR`/`SNAPSHOTS_DIR` (infra-level, host-relative bind-mount source paths in
`docker-compose.yml`) can point at the physically identical folder whether you're
running bare-metal or in Docker — no data migration, no "docker version and bare-metal
version have separate data" trap.

## Debugging checklist when a container has "wrong" config

1. Which `.env` does `env_file:` actually point at? (Not necessarily the one you edited.)
2. Does the value differ from the bare-metal `.env` for network-namespace-dependent
   vars (DB host, service hostnames)? If identical, that's often the bug, not a
   coincidence.
3. Did you rebuild the image, or only restart the container? An `env_file:` value
   changes on `docker compose up` (recreates the container reading fresh env) but a
   value baked into the image via `ENV`/`COPY` needs an actual rebuild.
4. `docker exec <container> python -c "from app.core.config import get_settings; print(get_settings())"`
   (or equivalent for your stack) to see the config the running process actually
   resolved — don't infer it from the files, read it from the live process.
