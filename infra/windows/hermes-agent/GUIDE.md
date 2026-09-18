# Windows Hermes Agent packaging (historical)

**Phase 8 (PRD v2.1.1):** `infra/windows/hermes-agent/installer` and OPSI product
`smc-hermes-agent` were **removed**. Production Hermes install is Work user-mode
Bootstrap + enterprise fork `scripts/install.ps1` (see
`tools/release/client/build_client_release.py` stage `hermes-bootstrap`).

Remaining scripts under `infra/windows/hermes-agent/scripts/` (e.g. `SmcHermesManaged.psm1`)
are not part of the production client-release `all` pipeline.

## Production release stages

```text
preflight → work → hermes-bootstrap → assemble → verify
```

Do not invoke removed `hermes` / `hermes-installer` / `runtime` / `opsi-*` stages.
