# SMC Salt Endpoint Control Plane

Repo-only Salt Lab + SMC Hermes Extension for PRD Work **v2.1** (ADR-026).

Salt replaces `services/runtime` **Endpoint Control Plane** only. Chat/Session/Attachment/Task stay on `apps/work` → Hermes Gateway `:8642`.

## Layout

```text
infra/salt/
  manifest/            # client-manifest.json (Salt 3008 LTS, pinned sha256)
  client/              # enrollment/handover Python + Windows bootstrap ps1
  master/master.d/     # production Master extras (auto_accept: false)
  lab/                 # docker-compose Master + fixture minion configs
  extensions/          # synced via saltutil.sync_* (__utils__/__salt__)
  states/              # highstate SLS (hermes, gateway, profiles, mcp)
  pillar/              # mock desired-state fixtures (tests/lab only)
  mock_backend/        # EndpointUserBinding + Desired State mock (tests only)
  tests/               # pytest (no live Salt required) + canary Pester stubs
  migration-capabilities.yaml
```

Production External Pillar must not import `mock_backend`. Lab Master may use `auto_accept: True`; production `master/master.d/security.conf` must not.

## Control owner mutex

`%ProgramData%\SMC\control-owner.json`:

```json
{ "hermes": "salt" }
```

Values: `salt` | `runtime`. Enterprise bootstrap writes `salt`. Never enable both owners. `apps/work` also supports `direct` (no Runtime `:8765`) when the file is absent.

## Tooling

```bash
cd infra/salt
uv sync --extra dev
uv run pytest
uv run ruff check .
```

Inventory (repo root, v2 verified FULL only):

```bash
uv run --project infra/salt python ../../scripts/salt-migration-inventory.py
```

Windows bootstrap dry-run:

```powershell
.\client\windows\bootstrap.ps1 -Master salt.example -MasterFingerprint <fp> -EnrollmentToken <tok> -BackendUrl https://backend -DryRun
```

## Live Minion

1. Install Salt Minion **3008.2** from `manifest/client-manifest.json` (SHA-256 required).
2. `minion.d/smc.conf`: `master`, `id` (endpoint id), `master_finger`.
3. Enrollment: client reports pubkey fingerprint; Salt Integration accepts after match. Client never accepts keys.
4. `saltutil.sync_all` then `state.highstate`.
5. Extensions load via `__utils__['smc_paths.layout']` / `__salt__['smc_hermes.*']` — no `sys.path` hacks.

## Canary / Go-No-Go

- [docs/salt/CANARY-v2.1.md](../../docs/salt/CANARY-v2.1.md)
- [docs/salt/GO-NO-GO.md](../../docs/salt/GO-NO-GO.md)
