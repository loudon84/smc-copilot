# OPSI Hermes v2.1.4 — Windows Acceptance Runbook

**PRD**: `docs/opsi/PRD-OPSI-v2.1.4.md`  
**Scope**: Fresh Install / Upgrade / Offline Gateway+Chat  
**Note**: Live gates (DoD #10) require Release Owner, Endpoint Ops, and Security Owner signatures. Automated fixtures do **not** substitute live proof.

## Preconditions

- Build Host produced release via `scripts/build-client-release.ps1` (no bypass of capability gates).
- Artifact includes `config/managed.defaults.yaml` (schema `smc.opsi.managed-config.v2`) and `runtime/runtime-build.json` with `capabilities` + `runtimeProfileDigest`.
- Endpoint has no requirement for system Python/Node/pip; Runtime is self-contained under `D:\Programs\SMC\Hermes`.

## A. Fresh Install (empty client)

1. Deploy OPSI package / run installer `/install /silent`.
2. Confirm:
   - `D:\Programs\SMC\Hermes\bin\hermes.exe` exists and `--version` matches release.
   - `C:\ProgramData\SMC\Hermes\.env` has unique `API_SERVER_KEY` (not in logs/manifest).
   - Scheduled Task `SMC Hermes Gateway` registered with WorkspaceRoot + `API_SERVER_*` contract.
3. Ready criteria (all required):
   - CLI version valid
   - Task registered + contract valid
   - Task/process started
   - TCP `127.0.0.1:8642` listening
   - `GET /health` → 200
   - Bearer `GET /v1/models` → 200
4. Offline: disconnect public network; restart Gateway; repeat health/auth; start `apps/work` → READY; Chat PASS.
5. Confirm no Endpoint `pip`/`npm install`/`npx -y`/registry fetch for standard Gateway/Chat path.

**Sign-off**: Release Owner ____  Endpoint Ops ____  Security ____  Date ____

## B. Upgrade (from Runtime missing aiohttp)

1. Install previous Runtime known to lack `aiohttp` (or simulated missing capability).
2. Run `/upgrade` with v2.1.4 payload.
3. Confirm:
   - Program tree replaced
   - HermesHome `config.yaml` / `.env` / workspace preserved
   - Managed defaults/enforced merged (existing instance models/providers win; enforced security/lazy policy wins)
   - Gateway restarted; `/health` + Bearer `/v1/models` PASS
   - Work reconnect + Chat PASS
4. Confirm upgrade did **not** repair via Endpoint package install.

**Sign-off**: Release Owner ____  Endpoint Ops ____  Security ____  Date ____

## C. Doctor / Capability read-back

1. Run HostOperations `doctor`.
2. Confirm report includes Hermes Runtime Capabilities (API Server/aiohttp, MCP/Filesystem MCP, Web, STT, Edge TTS, Hindsight, Tirith/LSP DISABLED, Workspace, Gateway Health/Auth, Offline/lazy policy) with profile/version/digest matching `runtime-build.json`.

**Sign-off**: Endpoint Ops ____  Date ____

## No-Go reminders

- Do not ship if Installer marks READY on Task existence alone.
- Do not share a fixed Gateway key across endpoints.
- Do not enable Tirith/LSP auto-install/Bitwarden auto-install without packaged inventory + gates.
- Do not leave Linux paths (`/data/hermes/...`) in Windows managed baseline.
