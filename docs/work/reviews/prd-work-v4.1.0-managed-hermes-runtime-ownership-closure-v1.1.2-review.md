# WORK v4.1.0 Managed Hermes Runtime Ownership Closure — PRD v1.1.2 Review

Review scope is the v1.1.2 revision of Stage PRD `docs/work/PRD-WORK-v4.1.0-managed-hermes-runtime-ownership-closure.md` (`source_revision: WORK-MANAGED-HERMES-RUNTIME-V4.1.0@v1.1.2/RM-01`, `grounded_commit: 6e7516bf53d9c2144453c291a8b1405d32af43a9`). This is a revision review of the already approved architecture. It reuses the v1.1.1 Evidence Baseline and Source Anchors. It does not re-run full discovery, does not authorize implementation, and does not mark Roadmap RM-01 DONE.

The only product delta under review is AC-02 / C01: keep a live `HERMES_HOME` export; delete Self-Install path exports; convert named second-order **module** snapshots only; keep function-body `join(HERMES_HOME, …)` data paths.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | In remains Work Data Plane Client closure. Live `HERMES_HOME` does not add an Adapter, Gateway `/api/*`, or Installer packaging. Function-body data joins staying in place does not enlarge blast radius. |
| G2 Existing capability | PASS | `getHermesHome()` remains path SOT. The live export is a compatibility binding over that getter, not a second owner. CLI remains `hermes-cli-runner`. |
| G3 Production ownership | PASS | Runtime paths stay on `hermes-runtime-config.ts`. Work is still not Gateway Process Owner. OPSI/Installer still owns the Gateway process. |
| G4 KEEP/MODIFY/ADD/REPLACE/REMOVE | PASS | Self-Install exports stay REMOVE. Named module snapshots stay CONVERT. `HERMES_HOME` is KEEP-as-live, which matches Target Inventory MODIFY of the path module rather than deleting the data-home binding. Source-tree `cwd=hermes-agent` stays REPLACE under C02, not KEEP under C01. |
| G5 Boundary | PASS | No new HTTP/IPC/auth contract. Probe still must not ingest Chat `HERMES_HOME`/`TERMINAL_CWD`. `path.join` remaining a real `string` is a language constraint, not a contract change. |
| G6 Behaviour to AC | PASS | AC-02 now states the observable: no Self-Install exports; live `HERMES_HOME` equals current `getHermesHome()` when read; only named module snapshots convert; function-body data joins KEEP. AC-01 still forbids concatenating `hermes-agent`/`venv` from home. Claim AC-02 remains blocking NEW_EVIDENCE. |
| G7 Evidence integrity | PASS | Prior blocking FAILs are not rewritten as observation. AC-05/AC-06 field FAILs stay TARGETED_RERUN. No blocking FAIL is deferred to a later Roadmap item. PRD still freezes scenario requirements; `export let` is Plan mechanism, not a PRD test harness. |

## Closed / reused prior findings

PRD Evidence Baseline records B1/M2/M3 closed and M1 closed as fail-closed listen inspect in v1.1.1. This revision does not reopen those gates. No OPEN BLOCKER/MAJOR from a prior PRD review artifact remains.

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | AC-02’s last sentence (“函数体内 `join(HERMES_HOME, …)` KEEP”) is snapshot-scope. Source-tree `cwd=join(HERMES_HOME,"hermes-agent")` remains forbidden by AC-01 and is replaced by C02. Evidence Baseline already splits KEEP files from Source-tree cwd. |
| N2 | NOTE | A live ESM/`export let` binding is not a per-access getter. The observable that matters is: after `setHermesHomeOverride` / cache invalidate, a function-body read of `HERMES_HOME` equals `getHermesHome()`. `path.join` cannot accept a non-string getter object. |
| N3 | NOTE | C01 Action is REMOVE (Self-Install API) while Target Runtime paths is MODIFY (keep live `HERMES_HOME`). That taxonomy is consistent if implementers do not delete the `HERMES_HOME` export. |
| N4 | NOTE | This revision was edited while `status` was already APPROVED. This review is the v1.1.2 architecture gate; converge only refreshes `approved_at` / `review_verdict`. |
| N5 | NOTE | `grounded_commit` remains `6e7516bf`. Delivery `base_commit` is later (`0cb5b34a`). Inventory reuse is still valid for this AC-02 wording change; do not treat HEAD drift as a new discovery trigger. |

PASS -> `smc-prd-converge`. This review does not modify architecture, create an implementation commit, or change Roadmap delivery status.
