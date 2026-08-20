# OPSI Hermes v2.1.5 — PATH Immutability Acceptance Runbook

**PRD**: `docs/opsi/PRD-OPSI-v2.1.5.md`  
**Scope**: Machine/User PATH bit-for-bit equality across Install / Repair / Upgrade / Uninstall / rollback  
**Note**: Live Windows 10/11 lifecycle matrix (AC-21514 / DoD §39.9–10) requires operator signatures. Unit/static gates do **not** substitute live proof.

## Preconditions

- Build Host produced Hermes installer release with `environment.path.policy=immutable` in `runtime-build.json`.
- Static gate `PERSISTENT_PATH_MUTATION_FORBIDDEN` is green (no Machine/User PATH writers in production Hermes Windows source / WiX).
- Endpoint under test is **not** a production workstation when constructing malformed PATH fixtures (use isolated VM / controlled registry).

## Capture helpers (do not log full PATH to remote telemetry)

Before each operation, record only digests (or keep raw strings local):

```powershell
$m0 = [Environment]::GetEnvironmentVariable("Path", "Machine")
$u0 = [Environment]::GetEnvironmentVariable("Path", "User")
# Compare after with Ordinal equality — no split/normalize/sort/dedupe/trim/case fold
```

Installer logs (default): `environment.path.policy=immutable`, `machinePath.*.sha256`, `*.unchanged`.

## Acceptance Matrix

| ID | Scenario | Expected | Pass |
| --- | --- | --- | --- |
| PATH-001 | Fresh Install | Machine PATH Ordinal unchanged | [ ] |
| PATH-002 | Fresh Install | User PATH Ordinal unchanged | [ ] |
| PATH-003 | Repair | Machine/User PATH unchanged | [ ] |
| PATH-004 | Upgrade | Machine/User PATH unchanged | [ ] |
| PATH-005 | Uninstall | Machine/User PATH unchanged | [ ] |
| PATH-006 | Machine PATH 无 Hermes | Work READY + Chat PASS | [ ] |
| PATH-007 | Machine PATH 无 Hermes | Gateway `/health` + Bearer `/v1/models` PASS | [ ] |
| PATH-008 | Gateway child process | process PATH has bin;scripts;node prefix | [ ] |
| PATH-009 | Machine registry | 无**新** Hermes PATH entry | [ ] |
| PATH-010 | User registry | 无**新** Hermes PATH entry | [ ] |
| PATH-011 | Repeated Install/Repair | PATH unchanged each time | [ ] |
| PATH-012 | Existing malformed PATH (isolated VM) | Installer does not normalize/repair | [ ] |
| PATH-013 | Existing Hermes legacy PATH entry | Upgrade/Uninstall does not clean it | [ ] |
| PATH-014 | Static/WiX scan | Persistent PATH writer = 0 | [ ] |
| PATH-015 | Failure rollback | PATH unchanged | [ ] |

## A. Fresh Install / Repair / Upgrade / Uninstall

1. Capture `M0` / `U0` (raw).
2. Run `/install /silent` → READY (`/health` + Bearer `/v1/models`) → capture after → Ordinal equal to `M0`/`U0` (**PATH-001/002/009/010**).
3. Run `/repair` (level 1) twice → PATH unchanged (**PATH-003/011**).
4. Run `/upgrade` with newer payload → PATH unchanged; legacy Hermes PATH tokens if present remain (**PATH-004/013**).
5. Run `/uninstall` → Program tree / Gateway task / dedicated `HERMES_*` vars removed; PATH still equals pre-uninstall snapshot (**PATH-005/013**).
6. Induce handled failure (e.g. corrupt payload mid-install) → rollback → PATH equals pre-op snapshot (**PATH-015**).

**Sign-off**: Release Owner ____  Endpoint Ops ____  Security ____  Date ____

## B. Machine PATH 无 Hermes — Gateway + Work

1. Ensure Machine PATH contains **no** Hermes bin/scripts (strip only in lab VM if needed; do not rewrite production PATH).
2. Confirm Scheduled Task launcher injects process-local PATH (`bin;scripts;node;<inherited>`).
3. Gateway Health/Auth PASS; Filesystem MCP resolves offline (**PATH-007/008**).
4. Start `apps/work` → absolute `getHermesCliPath()` → READY + Chat PASS; do **not** use `where hermes` as success criterion (**PATH-006**).

**Sign-off**: Endpoint Ops ____  Work Owner ____  Date ____

## C. Malformed / legacy PATH (isolated VM only)

1. Construct lab Machine PATH with empty tokens, trailing `;`, duplicate entries, and/or glued tokens **or** leave a pre-existing Hermes entry.
2. Install / Upgrade / Uninstall → raw PATH string identical before/after; no auto-repair of missing `;` (**PATH-012/013**).

**Sign-off**: Security ____  Endpoint Ops ____  Date ____

## D. Static / Release gate

1. `python -c "from tools.release.hermes.path_policy_gate import assert_hermes_path_policy; assert_hermes_path_policy()"` → PASS.
2. WiX `Product.wxs` / `Bundle.wxs` have no `<Environment Name="PATH" …>`.
3. `runtime-build.json` declares `environment.path.policy=immutable`.

**Sign-off**: Release Owner ____  Date ____ (**PATH-014**)

## No-Go reminders

- Do not restore Machine/User PATH mutation for CLI convenience.
- Do not auto-clean legacy Hermes PATH entries during Upgrade/Uninstall.
- Do not guess missing `;` or upload full PATH to central telemetry / OPSI remote events.
- Do not attribute all historical corruption to Hermes without forensic evidence (independent track).
