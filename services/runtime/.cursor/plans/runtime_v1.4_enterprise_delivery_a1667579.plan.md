---
name: runtime v1.4 enterprise delivery
overview: "Implement the full PRD v1.4 across all five phases: converge Chat/Gateway onto the Instance control plane with internal Bearer auth, make Hermes update/rollback transactional, harden secrets/backups/downloads, add readiness + diagnostics, and scaffold the enterprise Windows installer, release pipeline, and signing. Delivered as code edits + tests (no commits); installer/CI/signing land as best-effort scaffolds."
todos:
  - id: fr01-gateway-auth
    content: "FR-01: Add GatewayCredentialService + HermesGatewayClientFactory; inject Bearer API_SERVER_KEY into HermesGatewayClient and all call sites; update smoke test. Keep key out of logs/responses."
    status: completed
  - id: fr02-instance-chat
    content: "FR-02/03/04: Add InstanceRefResolver + InstanceChatService + /api/v1/instances/{id}/chat/* and sessions endpoints; convert legacy /profiles chat to deprecated adapter; add instance_id to chat_settings/attachments with backfill migration."
    status: completed
  - id: fr05-config-apply
    content: "FR-05: Split configuration PATCH (save+validate, no restart) from POST /configuration/apply (restart+health, snapshot-restore on failure)."
    status: completed
  - id: fr06-secret-isolation
    content: "FR-06: Gateway env allowlist inheritance, strip inherited provider secrets, log env key names only, broaden redaction set."
    status: completed
  - id: fr07-mcp-compile
    content: "FR-07: MCP config compiler + secret resolver + validator; new mcp_servers/mcp_secret_refs/mcp_test_results tables; compile to Hermes config with status machine and runtime test."
    status: completed
  - id: fr08-update-plan
    content: "FR-08: Update plan service + POST /runtime/update/plan; real CompatibilityService (api/config/python); runtime_update_plans table."
    status: completed
  - id: fr09-10-transactional-update-rollback
    content: "FR-09/10: Transactional update with canary + instance rebind + probes + auto-restore on failure; transactional rollback (all/selected/canary) restoring instances and gateways."
    status: completed
  - id: fr11-pinned-cleanup
    content: "FR-11: Pinned-version cleanup guard (active/referenced/last-healthy/rollback-reserved) returning runtime_version_pinned; enforce in background cleanup + DELETE version."
    status: completed
  - id: fr12-job-cancel
    content: "FR-12: CancellationToken threaded through job/install/downloader; cooperative checks kill pip, close streams, delete staging; add runtime_jobs cancel columns."
    status: completed
  - id: fr13-install-paths
    content: "FR-13: Remove hardcoded D:\\Programs; user-level default + optional machine-level install paths; legacy detection/migration; relax precheck (no Git/Node)."
    status: completed
  - id: fr14-15-bundle-wheelhouse
    content: "FR-14/15: build/runtime-bundle.ps1 (self-contained bundle) + build/hermes-wheelhouse.ps1 (offline wheelhouse); switch install to pip --no-index --find-links."
    status: completed
  - id: fr16-18-installer-daemon
    content: "FR-16/17/18: WiX MSI + Burn bootstrapper scaffold with exit codes and params; fix UserDaemon port/lifecycle + add replace/start/stop/restart/repair/status commands; keep Windows Service experimental."
    status: completed
  - id: fr19-20-bootstrap
    content: "FR-19/20: BootstrapService + /api/v1/bootstrap endpoints; one-time bootstrap token (bootstrap_sessions); bootstrap config JSON without provider keys."
    status: completed
  - id: fr23-24-artifact-security
    content: "FR-23/24: Ed25519 manifest signature verify + archive/download policy (HTTPS, domain allowlist, size/timeout, path-traversal, cache); wire into downloader/install; runtime_versions signature columns."
    status: completed
  - id: fr21-22-service-version-update
    content: "FR-21/22: Bump version to 1.4.0; runtime_service_versions table; RuntimeServiceUpdate maintenance flow + /service/update/{check,download,apply}."
    status: completed
  - id: fr25-ci-signing
    content: "FR-25: .github/workflows/runtime-windows.yml (test/build/sign/publish, dev/beta/stable channels); Authenticode signing steps parameterized on secrets (scaffold)."
    status: completed
  - id: fr27-readiness
    content: "FR-27: Real Runtime readiness states (starting/ready/degraded/maintenance/failed) with per-check results."
    status: completed
  - id: fr26-28-backup-diagnostics
    content: "FR-26/28/29/30: Secure backup (no plaintext .env, metadata-only manifest, DPAPI optional, stop-before-restore); diagnostics bundle endpoint; Repair/Uninstall installer flows preserving user data."
    status: completed
  - id: capabilities-apiversion
    content: Bump API version to 1.1 and add all new v1.4 capability flags in core/capabilities.py.
    status: completed
  - id: tests-lat
    content: Add unit tests (PRD 13.1) + installable-wheel integration test; author gated real-Hermes/installer E2E; update lat.md docs and run lat check + pytest + ruff.
    status: completed
isProject: false
---

# Runtime v1.4 Enterprise Delivery

Implements PRD [prd/ver1.4.md](prd/ver1.4.md) in full. Ordered to match the PRD's commit sequence (section 16). Each numbered todo is an independently testable slice. No git commits — edits + tests only.

Environment caveat: MSI/WiX, Burn bootstrapper, Authenticode signing, GitHub Actions Windows runners, and real signed Hermes wheelhouse artifacts require infra/credentials not present here. Those (Phase 3/4 build+sign+CI) are delivered as buildable scripts, WiX sources, and workflow YAML that are correct-by-construction but cannot be executed/signed in this sandbox. All Python control-plane logic (Phases 1, 2, 5) is fully implemented and unit-tested locally.

## Post-task checklist (from AGENTS.md)
- Update `lat.md/` for changed architecture/tests/behavior.
- Run `lat check` and `pytest` + `ruff` before declaring done.

---

## Phase 1 — Runtime link convergence (M1)

### FR-01 Gateway Credential Broker + Bearer auth
- New `src/services/gateway_credential_service.py`: `GatewayCredentialService.resolve_for_instance(instance_id)` -> `(gateway_port, api_server_key)` by loading `HermesInstance` then `SecretService.resolve(profile_name, "API_SERVER_KEY")`. Key never logged/returned.
- New `src/integrations/hermes/client_factory.py`: `HermesGatewayClientFactory.create_for_instance(instance_id)` and `create_for_profile(profile_name)` -> returns `HermesGatewayClient` carrying the bearer token.
- Edit [src/integrations/hermes/client.py](src/integrations/hermes/client.py): add optional `api_key`/`auth_token` ctor arg; inject `Authorization: Bearer <key>` on `health_check/list_models/create_run/get_run/list_run_events/cancel_run`. Keep header out of logs.
- Replace direct `HermesGatewayClient(port)` construction in `hermes_gateway_client.py`, `chat_model_service.py`, `profile_ref_resolver.py`, `instance_gateway_service.py`, `gateway_supervisor.py`, `task_runtime.py`, `workers/v12_workers.py` with factory calls.
- Edit [scripts/runtime-smoke-test-windows.ps1](scripts/runtime-smoke-test-windows.ps1) to send Bearer to `/v1/models`.

### FR-03/FR-02/FR-04 Instance-native Chat
- New `src/services/instance_ref_resolver.py`: resolve Instance by id/name/profile_name/`default` -> `{instanceId,name,profileName,runtimeVersion,gatewayPort,status,healthy}` (reads `instances`, `runtime_versions`, live gateway health via factory). No `profiles.*`.
- New `src/services/instance_chat_service.py`: models, model-options, model-config get/put, completions (SSE), abort, session messages — all resolved through Instance + credential broker. Reuses attachment/session read logic but keyed on `instance_id`.
- Edit [src/api/v1/chat.py](src/api/v1/chat.py) (or new `src/api/v1/instance_chat.py`): add `GET/POST /api/v1/instances/{id}/chat/*` and `/instances/{id}/sessions/{sessionId}/messages` per FR-02.
- Keep legacy `/profiles/{id}/chat/*` as thin adapter: map `profile -> profile_name -> HermesInstance -> InstanceChatService`; add `Deprecation: true` + `Sunset` response headers.
- DB migration: add `instance_id` to `profile_chat_settings` and `chat_attachments`; backfill via `profile.name -> HermesInstance.profile_name`. `instance_id` preferred, `profile_id` compat-only. New Alembic revision under [migrations/versions/](migrations/versions/).

### FR-05 Config save/apply split
- Edit [src/services/configuration_service.py](src/services/configuration_service.py): `patch(..., apply: bool=False)` returns `{configuration, restartRequired, applied, snapshotId}` and does NOT restart. New `apply(instance_id)`: restart gateway + health check; on failure restore snapshot, restart old config, return `configuration_apply_failed`.
- Edit [src/api/v1/configurations.py](src/api/v1/configurations.py): stop auto-restart in PATCH; add `POST /instances/{id}/configuration/apply`.

### FR-06 Strict Gateway env isolation
- Edit [src/runtime/gateway_environment.py](src/runtime/gateway_environment.py): replace `dict(os.environ)` with an explicit allowlist (`PATH,PATHEXT,SYSTEMROOT,WINDIR,COMSPEC,USERPROFILE,LOCALAPPDATA,APPDATA,TEMP,TMP,LANG`), then inject scoped secrets; strip any inherited `*_API_KEY/*_TOKEN/*_SECRET/*_PASSWORD/API_SERVER_KEY` not explicitly provided. Change logging to emit only `envKeys` (names), never values; broaden redaction to `PASSWORD/PASS/SECRET/CREDENTIAL/COOKIE/CONNECTION_STRING`.
- Edit [src/runtime/gateway_process.py](src/runtime/gateway_process.py): log env key names only.

### FR-07 MCP compile-to-Hermes
- New `src/runtime/mcp_config_compiler.py` (+ `McpSecretResolver`, `McpRuntimeValidator`): compile Runtime MCP records -> Hermes MCP config, run `hermes config check`, apply/restart, runtime test. Status machine `draft/validating/ready/error/disabled`.
- DB: new tables `mcp_servers`, `mcp_secret_refs`, `mcp_test_results` (models in [src/db/models/runtime.py](src/db/models/runtime.py) + repo + migration). Migrate `mcp_servers.json` -> DB as compat import.
- Edit [src/services/mcp_service.py](src/services/mcp_service.py) + [src/api/v1/configurations.py](src/api/v1/configurations.py) MCP routes to use compiler + DB.

## Phase 2 — Version transactions (M2)

### FR-08 Update Plan
- New `src/services/runtime_update_plan_service.py`: `POST /api/v1/runtime/update/plan` -> `{fromVersion,toVersion,affectedInstances,compatibility{api,config,python},warnings}`. Add route in [src/api/v1/runtime.py](src/api/v1/runtime.py). Table `runtime_update_plans` (model+migration).
- Replace stub [src/services/update_service.py](src/services/update_service.py) `CompatibilityService.check` with real api/config/python checks.

### FR-09 Transactional update + FR-10 rollback
- Edit [src/services/update_service.py](src/services/update_service.py): install inactive -> verify/doctor/compat -> pick canary Instance -> stop/rebind/start canary -> gateway health -> `/v1/models` -> min chat probe -> roll remaining Instances -> set active -> commit. Failure path: stop new gateway, restore `Instance.runtime_version_id`, restore old active (incl. `write_active_atomic`), restart old gateway, health, mark `update failed`.
- `RollbackService`: rebind Instances + restart gateways + chat probe; support `all`/selected/canary. Persist rollback state in `runtime_jobs.rollback_state_json`.

### FR-11 Pinned version cleanup
- Edit `_cleanup_old_versions` + `DELETE /runtime/versions/{version}`: reject when Active / referenced by Instance / referenced by Update Plan / last healthy / rollback-reserved -> error `runtime_version_pinned`. Background cleanup honors the same guard.

### FR-12 Cooperative job cancel
- New `src/runtime/cancellation_token.py`. Thread `CancellationToken` through [src/services/runtime_job_service.py](src/services/runtime_job_service.py) + [src/services/installation_service.py](src/services/installation_service.py): check at download-chunk/verify/extract/venv/pip/doctor/activate; cancel closes HTTP stream, kills pip subprocess, deletes staging, no activation, returns `cancelled`. Add `cancellation_requested_at`, `operation_id` to `runtime_jobs` (migration).
- Edit [src/runtime/artifact_downloader.py](src/runtime/artifact_downloader.py) to accept a token and abort mid-stream.

## Phase 3 — Enterprise Windows packaging (M3) [best-effort scaffold]

### FR-13 Install-path policy
- Edit [src/runtime/windows_program_paths.py](src/runtime/windows_program_paths.py) + [src/core/config.py](src/core/config.py): drop hardcoded `D:\Programs`; default user-level `%LOCALAPPDATA%\Programs\SMC\CopilotRuntime` + `...\HermesAgent`, optional machine-level `%ProgramFiles%\SMC\...`; keep data dirs; detect legacy `D:\Programs\*` and offer migration (no auto-delete). Relax [scripts/runtime-precheck-windows.ps1](scripts/runtime-precheck-windows.ps1) to not require Git/Node.

### FR-14/FR-15 Bundle + wheelhouse
- New `build/runtime-bundle.ps1` -> `runtime-bundle-win-x64.zip` (runtime, embedded python, site-packages, scripts, migrations, config, manifest.json).
- New `build/hermes-wheelhouse.ps1` -> `hermes-agent-<v>-win-x64.zip` (whl + wheelhouse + requirements.lock + artifact.json). Update [src/services/installation_service.py](src/services/installation_service.py) pip path to `--no-index --find-links wheelhouse`.

### FR-16 Installer + FR-17 UserDaemon + FR-18 service boundary
- New `installer/wix/` (WiX 5 MSI: product, dirs, task-scheduler ONLOGON, exit codes 0/10-17) and `installer/bootstrapper/` (Burn: `/quiet /channel /installScope /bootstrapConfig /norestart /log`).
- Edit [src/local_service/windows_user_daemon.py](src/local_service/windows_user_daemon.py): stop temp Runtime + wait for 8765 free before install; add `install --replace/start/stop/restart/repair/status --json`; never fail solely on healthy-runtime port occupancy. Keep Windows Service `experimental`.

### FR-19/FR-20 Bootstrap
- New `src/services/bootstrap_service.py` + `POST /api/v1/bootstrap`, `GET /api/v1/bootstrap/jobs/{id}`. One-time bootstrap token (table `bootstrap_sessions`), invalidated after completion. Reads bootstrap config JSON (no provider keys).

## Phase 4 — Release + security (M4) [best-effort scaffold]

### FR-23 Signed manifests + FR-24 artifact policy
- New `src/runtime/artifact_signature.py` (Ed25519 verify, embedded pubkey, keyId, expiry) + `src/runtime/archive_policy.py` (HTTPS enforce, allowed domains, max manifest/artifact size, timeout, redirect domain check, archive file-count + total-size + path-traversal guard, cache, partial cleanup). Wire into [src/runtime/artifact_downloader.py](src/runtime/artifact_downloader.py) + [src/services/installation_service.py](src/services/installation_service.py). Add `signature_key_id/artifact_type/manifest_version/verified_at` to `runtime_versions` (migration).

### FR-21/FR-22 Runtime Service versioning + self-update
- Bump [pyproject.toml](pyproject.toml) to `1.4.0`; expose `serviceVersion/apiVersion/activeHermesVersion`. Table `runtime_service_versions`. New `src/services/runtime_service_update.py` + `GET /service/update/check`, `POST /service/update/download`, `POST /service/update/apply` (maintenance-process flow with DB backup + Alembic + rollback).

### FR-25 Code signing + CI
- New `.github/workflows/runtime-windows.yml` (pytest, ruff, build wheel/bundle/MSI/Setup.exe, sign, integration test, publish manifest; dev/beta/stable channels). Signing steps parameterized on secrets (documented as required, not executable here).

## Phase 5 — Acceptance + observability (M5)

### FR-27 Readiness
- Edit [src/services/runtime_status_service.py](src/services/runtime_status_service.py): real states `starting/ready/degraded/maintenance/failed` from checks (database, migration, job worker, secret store, active hermes, instance, gateway, disk, manifest); return `{status, checks{...}}`.

### FR-28 Diagnostics bundle + FR-26 secure backup + FR-29 Repair + FR-30 Uninstall
- New `src/services/diagnostic_bundle_service.py` + `POST /api/v1/diagnostics/bundle` -> zip (versions, statuses, job summary, log tails, env check, config structure, manifest meta); never secrets/tokens/env/chat.
- Edit [src/services/backup_service.py](src/services/backup_service.py): exclude `.env`/DPAPI/provider secrets by default; manifest records secret metadata only; optional DPAPI-bound secret backup; stop instances before restore.
- Installer `Setup.exe /repair` + `/uninstall` flows (in WiX/bootstrapper), preserving `~/.hermes` by default with explicit `/removeRuntimeData|/removeHermesVersions|/removeHermesUserData`.

### Capabilities + API version
- Edit [src/core/capabilities.py](src/core/capabilities.py): bump apiVersion to `1.1`; add `gateway.auth.internal, instances.chat, instances.sessions, runtime.update.plan, runtime.update.transactional, runtime.job.cancel, runtime.service.update, runtime.bootstrap, runtime.repair, mcp.compile, diagnostics.bundle, artifact.signature`.

### Tests (13.1–13.4)
- Unit tests from PRD 13.1 (bearer token, instance chat not reading profiles.status, no inherited provider secrets, env-keys-only logging, update rebind/restore, pinned cleanup reject, job cancel kills pip, mcp compile writes config, backup excludes env, readiness degraded).
- Integration test that builds an installable wheel bundle + pip `--no-index` (replaces README-only-fail-only test). Real-Hermes + installer E2E authored but gated (require real artifacts / Windows host).

## Data model summary (new/changed)
- New tables: `runtime_service_versions`, `runtime_update_plans`, `mcp_servers`, `mcp_secret_refs`, `mcp_test_results`, `bootstrap_sessions`.
- Changed: `profile_chat_settings(+instance_id)`, `chat_attachments(+instance_id)`, `runtime_jobs(+cancellation_requested_at,+rollback_state_json,+operation_id)`, `runtime_versions(+signature_key_id,+artifact_type,+manifest_version,+verified_at)`.

## Sequencing (matches PRD §16)
gateway-auth -> instance chat -> config apply -> secret isolation -> mcp compile -> update plan/rollout -> rollback -> job cancel -> bundle -> installer -> signed manifest/policy -> service update -> readiness/repair/diagnostics -> windows E2E tests -> docs.