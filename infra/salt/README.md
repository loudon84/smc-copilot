# SMC Salt Endpoint Control Plane

Repo-only Salt Lab + SMC Hermes Extension for PRD Work v2.0 (ADR-026).

Salt replaces `services/runtime` **Endpoint Control Plane** only. Chat/Session/Attachment/Task stay on `apps/work` → Hermes Gateway.

## Layout

```text
infra/salt/
  lab/                 # docker-compose Master + fixture minion configs
  extensions/          # synced via saltutil.sync_*
  states/              # highstate SLS
  pillar/              # mock desired-state fixtures
  mock_backend/        # EndpointUserBinding + Desired State mock
  tests/               # pytest (no live Salt required)
```

## Control owner mutex

`%ProgramData%\SMC\control-owner.json` (or `SMC_CONTROL_OWNER_PATH`):

```json
{ "hermes": "salt" }
```

Values: `salt` | `runtime`. Never enable both owners.

## Tooling

```bash
cd infra/salt
uv sync --extra dev
uv run pytest
uv run ruff check .
```

Inventory (repo root):

```bash
python scripts/salt-migration-inventory.py
```

## Lab (optional live Master)

```bash
cd infra/salt/lab
docker compose up -d
```

Windows Minion on a real PC is optional for unit tests; fixture tests cover extension logic.

Live Minion: run `saltutil.sync_all` (modules, states, grains, returners, beacons, **utils**). Extension `_utils` is imported as a Python package in tests; on a real minion prefer `saltutil.sync_utils` and `__utils__['control_owner.read_control_owner']` if the package import is unavailable.
