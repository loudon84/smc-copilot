# Work Release Server

This directory hosts the static HTTPS release server for `apps/work` production artifacts.

The server is intentionally dumb: Nginx serves files from a read-only bind mount, while a separate publisher user stages, validates, promotes, and rolls back immutable releases on the host filesystem.

## Layout

Expected host storage layout:

```text
/data/smc-release/
└── work/
    ├── staging/
    ├── releases/
    └── stable -> releases/<version>
```

Nginx maps `/data/smc-release` to `/srv/releases`, so the client-visible update feed is:

```text
https://release.superic.com/work/stable/latest.yml
```

## Compose

Use the pinned Compose stack in `docker-compose.yml`:

- `nginx:1.26.3-alpine`
- `443:443`
- `${RELEASE_DATA_ROOT:-/data/smc-release}:/srv/releases:ro`
- `./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro`
- `./certs:/etc/nginx/certs:ro`
- container `healthcheck` against `https://127.0.0.1/healthz`

The release volume is always mounted read-only inside the container. Production Nginx `server_name` is `release.superic.com`.

## TLS

Production must provide a real certificate chain trusted by Windows clients, with SAN `DNS:release.superic.com`. Do not commit real certificate material. Windows clients must not skip TLS verification.

For local smoke tests only, generate throwaway certs with:

```bash
./scripts/gen-dev-certs.sh
```

That script creates `certs/release.crt` and `certs/release.key` for local Compose startup; it is not acceptable for production.

## Health checks

Validate the deployed server with:

```bash
nginx -t
./scripts/healthcheck.sh https://release.superic.com
./scripts/healthcheck.sh https://release.superic.com /work/stable/smc-copilot-<version>-setup.exe
```

The server must:

- return `200 OK` on `/healthz`
- allow only `GET` and `HEAD`
- disable directory listing
- serve `latest.yml` with `Cache-Control: no-cache, no-store, must-revalidate`
- serve `.exe` and `.blockmap` with `Cache-Control: public, max-age=31536000, immutable`
