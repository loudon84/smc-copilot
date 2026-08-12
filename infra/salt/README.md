# SMC Salt Endpoint Control Plane (v2.2)

Repo Salt Lab + production-ready client/security paths for PRD Work **v2.2**. Salt replaces `services/runtime` **Endpoint Control Plane** only. Chat/Session/Attachment/Task stay on `apps/work` → Hermes Gateway `:8642`.

## Layout

```text
infra/salt/
  manifest/            # client-manifest.example.json (Salt 3008 LTS, pinned sha256)
  client/              # salt_control_client, device_credential, journal, handover, Windows ps1
  master/master.d/     # production Master (auto_accept: false, multimaster failover)
  rollout/rings.yaml   # Lab/Ring0/1/2/3 thresholds + SLO
  lab/                 # docker-compose Master + fixture minion configs
  extensions/          # Ed25519 artifacts, secret materialize, HTTPS returner + spool
  states/              # highstate SLS (hermes, gateway, profiles, mcp)
  pillar/              # mock desired-state fixtures (tests/lab only)
  mock_backend/        # EndpointUserBinding + Desired State mock (tests only)
  tests/               # pytest + Canary.v2.2.Tests.ps1 (hardware = Manual Gate)
  tools/               # sign_artifact_manifest.py (dev Ed25519)
  migration-capabilities.yaml
```

Production External Pillar must not import `mock_backend`. Lab Master may use `auto_accept: True`; production `master/master.d/security.conf` must not.

## v2.2 live integration

| Component | Production | Lab/DryRun |
| --- | --- | --- |
| Bootstrap | `-SaltControlUrl` → `POST /salt/v1/enrollments` | `-DryRun` only; token-hash stand-in allowed |
| Device credential | DPAPI Machine Scope (`device_credential.py`) | Fernet file backend in tests |
| Journal | `%ProgramData%\SMC\bootstrap-journal.json` | Resume + COMPLETED before `control-owner=salt` |
| Artifacts | Ed25519 `keyId` + public key | HMAC when `SMC_SALT_ENV=lab\|test` |
| Secrets | `materialize()` + Salt Control API | fixture/XOR when `SMC_SALT_ENV=lab\|test` |
| Returner | HTTPS batch + encrypted spool | JSONL sink when `SMC_SALT_ENV=lab\|test` |

## Control owner mutex

`%ProgramData%\SMC\control-owner.json`: `{ "hermes": "salt" }` — written only after journal **COMPLETED** (health + work probe).

## Tooling

```bash
cd infra/salt
uv sync --extra dev
uv run pytest -q
uv run ruff check .
python scripts/check-production-guards.py
```

Salt Control (separate service):

```bash
cd services/salt-control && uv run pytest -q
```

Inventory (repo root):

```bash
python scripts/salt-migration-inventory.py --check
```

Windows bootstrap DryRun:

```powershell
.\client\windows\bootstrap.ps1 -Master salt-a.internal -MasterFingerprint <fp> -EnrollmentToken <tok> -BackendUrl https://backend -DryRun
```

Live bootstrap (requires Salt Control):

```powershell
.\client\windows\bootstrap.ps1 ... -SaltControlUrl https://salt-control.internal -ManifestPath .\manifest\client-manifest.example.json
```

## Canary / Go-No-Go

- Repo: `tests/canary/Canary.v2.2.Tests.ps1` (hardware Cases A–F **Skipped** — Manual Gate)
- Workflow: `.github/workflows/salt-canary.yml` (`workflow_dispatch`, runner `smc-salt-canary`)
- Evidence templates: `docs/salt/evidence/v2.2/templates/`
- [docs/salt/GO-NO-GO.md](../../docs/salt/GO-NO-GO.md)

## Runtime decommission (Phase 6)

Set `SMC_RUNTIME_ENDPOINT_CONTROL_ENABLED=false` after Ring 3. Frozen Runtime endpoint routes return 410; Chat/Task unchanged. See `contracts/runtime-api/ENDPOINT_CONTROL_PLANE_FREEZE.md`.
