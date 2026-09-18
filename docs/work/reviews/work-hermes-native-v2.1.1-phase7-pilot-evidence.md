# WORK-HERMES-NATIVE-V2.1.1 — Phase 7 Pilot Evidence

**Plan:** Hermes Native Enterprise Runtime v2.1.1  
**PRD:** `PRD-WORK-HERMES-NATIVE-ENTERPRISE-RUNTIME-V2` v2.1.1 `APPROVED_FOR_PLAN`  
**Date:** 2026-09-18  
**Workspace:** `work/prd-v6.0` (implementation tree; baseline was `1ad1af60`)

## Synthetic fixture results (PASS)

| Suite | Command | Result |
|---|---|---|
| Release config v2 | `python -m pytest tools/release/tests/test_release_config_v2.py -q` | PASS |
| Client release (no HermesZip/OPSI) | `python -m pytest tools/release/tests/test_client_release.py -q` | PASS (14 with config) |
| Hermes fork official-source | `python -m pytest e:/git/hermes-agent/tests/test_official_source.py -q` | PASS (3) |
| Work bootstrap | `npx vitest run tests/hermes-bootstrap.test.ts` (cwd apps/work) | PASS (11) |
| Work native adapter / control-owner | T2 focused vitest (8 files) | PASS (52) |
| Work Root / settings | T3 focused vitest | PASS (41+) |

### Synthetic AC coverage (digest)

| AC | Evidence class | Status |
|---|---|---|
| A-INSTALL-003 chat blocked until READY | UNIT hermes-bootstrap | PASS |
| A-INSTALL-004 ENSURE_GIT before ls-remote | UNIT hermes-bootstrap | PASS |
| A-INSTALL-005 lock prevents parallel | UNIT hermes-bootstrap | PASS |
| A-INSTALL-006 remote/ssh skip | UNIT hermes-bootstrap | PASS |
| A-RUNTIME-003 LOCALAPPDATA home OK | UNIT runtime-adapter | PASS |
| A-OWNER-001 observed opsi → effective direct | UNIT hermes-control-owner | PASS |
| A-CONFIG-001 work-settings.json SOT | UNIT connection-config-security | PASS |
| A-PROFILE-* Root vs profile Home | UNIT hermes-root-profile | PASS |
| A-POLICY-002/003 | UNIT hermes-bootstrap | PASS |
| A-REPAIR-001 confirm required | UNIT hermes-bootstrap | PASS |
| A-RELEASE-001/002 no OPSI/HermesZip in all | UNIT test_client_release | PASS |
| A-COMPAT-001 capability SOT pointer | CODE run-stream + bootstrap FAIL on miss | PASS |
| A-FORK-* RepoUrl / no ZIP / official-source | FORK tests + install.ps1 | PASS (unit) |

Secrets: none recorded (digests/SHAs only).

## Golden Consumer record

```text
smc-copilot repo          = loudon84/smc-copilot
smc-copilot branch         = work/prd-v6.0
smc-copilot HEAD (at evidence) = see `git rev-parse HEAD` in working tree (dirty with T0–T5 impl)
enterprise Hermes path    = e:\git\hermes-agent
enterprise Hermes origin  = http://git.superic.com/aiplatform/hermes-agent.git
enterprise Hermes HEAD    = 29112bef099274229cadff79cdff7bf7b99c4b77
approvedCommit (YAML)     = 29112bef099274229cadff79cdff7bf7b99c4b77
installUrl                = http://git.superic.com/aiplatform/hermes-agent.git
```

### Live Golden Consumer (clean Windows greenfield)

| Step | Status |
|---|---|
| Clean Windows user, no system Git | **DEFERRED** — requires operator machine |
| Work package + bundled install.ps1 Bootstrap → READY | DEFERRED |
| Failure injection mid-clone / policy / gateway | DEFERRED (synthetic covers order/mutex) |
| Repair wrong-origin confirm path | DEFERRED (unit covered) |

Synthetic fixtures **do not** replace live Golden Consumer per PRD §27. Live signoff remains an operator gate before production promote. Phase 8 tree deletion proceeds only for components already disconnected from production `all` (T5); live pilot still required for Release Gate VERIFIED.

## Failure injection (synthetic)

| Injection | Expected | Status |
|---|---|---|
| remote/ssh mode | 0 local mutation | PASS (unit) |
| parallel bootstrap | lock wait / single installer | PASS (unit) |
| capability miss after health | not READY | PASS (code) |
| Repair without confirm | rejected | PASS (unit) |
| origin mismatch | REPO_MISMATCH, no silent set-url | PASS (unit) |

## Phase 8 physical removal (T7)

Deleted from repository:

- `tools/release/hermes/build_runtime.py` (+ `build_runtime.ps1`)
- `infra/windows/hermes-agent/installer/` (WiX/Burn)
- `infra/opsi/products/smc-hermes-agent/`
- `tools/release/tests/test_hermes_builder.py` (depended on build_runtime)

Lab helpers removed from `build_client_release.py` / `verify_client_release.py`.

**Live Golden Consumer** remains DEFERRED for Release Gate VERIFIED; synthetic Phase 7 PASS was the implementation gate for this delete after T5 pipeline disconnect.
