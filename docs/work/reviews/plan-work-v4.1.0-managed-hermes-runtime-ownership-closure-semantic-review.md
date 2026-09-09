# WORK v4.1.0 Managed Hermes Runtime Ownership Closure — Semantic Plan Review (v1.1.2)

Review scope is canonical Plan `.cursor/plans/work-v4.1.0-managed-hermes-runtime-ownership-closure.plan.md` (`plan_id: WORK-V4.1.0-RUNTIME-RM-01`, `source_revision: WORK-MANAGED-HERMES-RUNTIME-V4.1.0@v1.1.2/RM-01`). Router result was `REQUIRED` because of `INTEGRATION_HOTSPOT` and `COMPLEX_CROSS_TODO_DEPENDENCY`. The Plan declares `acceptance_contract: smc.acceptance.v1`, so this is the required Actual Semantic Review after the AC-02 REVISE. This review does not execute other Plans.

The previous semantic review PASSed an older AC-02 that deleted the `HERMES_HOME` export. That review is superseded. This review judges the current Plan against APPROVED PRD v1.1.2.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| Grounding | PASS | C01 still names the real snapshot symbols (`PROFILES_DIR`, `STAGING_ROOT`, `MODELS_FILE`, `HERMES_OFFICE_DIR`) and the import-time `export const HERMES_HOME = getHermesHome()`. Function-body KEEP files (`config.ts`, `config-health.ts`, `account-store.ts`, `utils.ts`, `gateway-ports.ts`) are no longer C01 writes. |
| Ponytail | PASS | Live `HERMES_HOME` reuses the existing getter instead of rewriting every data-path call site. Named module snapshots are the only second-order conversions. C02 still reuses `hermes-cli-runner`. No new Adapter or Gateway `/api/*`. |
| Single writer | PASS | T1 owns path API + domain CLI + bundled skills. T2 remains the sole `hermes.ts` / dashboard / Gateway-supervisor writer. T3 owns probe/reducer. T4 owns model-discovery. T5 owns Self-Install UI. T6 owns guards/docs. T1 Depends On T2, T4. |
| Coverage | PASS | AC-02 obligation text matches the PRD byte-for-byte and maps only to C01 / T1 / V01. AC-01 still maps C01+C02+C03+C06+C07+C08+C10. Source-tree cwd replacement is T1 C02, not a KEEP violation. |
| Lifecycle | PASS | Unchanged from the prior PASS: connect / Chat / Gateway down/up / STT writers. Windows listen inspect stays fail-closed and is not a kill path. |
| Boundary | PASS | Probe stays adapter-owned; Chat stays Gateway HTTP/SSE; CLI stays runner-owned. Remote dashboard remains KEEP. |
| Verification | PASS | V01 oracle now requires live `HERMES_HOME` after override and named module snapshots gone, while allowing function-body `join(HERMES_HOME)` KEEP. Negative case still allows fixture literals. |
| Scope | PASS | Installer packaging, new Gateway APIs, `apps/desktop`, and Skill Run stay out. `config.ts` / `config-health.ts` / `account-store.ts` are not added back into C01. |
| Cursor mapping | PASS | Markdown T1–T6 match Cursor ids `t1`–`t6`. Status changes do not alter Plan semantics. |
| Prior evidence | PASS | Blocking claims stay FAILED/NEW_EVIDENCE or TARGETED_RERUN with invalidation reasons. No prior blocking FAIL is demoted to observation. |

## Closed findings from the v1.1.2 REVISE

The Plan no longer instructs T1 to delete the `HERMES_HOME` export or to rewrite function-body data joins in `config.ts` / `config-health.ts` / `account-store.ts` / `utils.ts` / `gateway-ports.ts`. C01 write set matches that narrower obligation.

## Notes

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | `export let HERMES_HOME` synced on wrapped `getHermesHome` / `setHermesHomeOverride` / `invalidateHermesRuntimeConfigCache` is the minimum live binding that stays a real `string` for `path.join`. Do not export a getter object. |
| N2 | NOTE | T2 production still reads symbols T1 will delete (`HERMES_PYTHON` / `hermesCliArgs` / `HERMES_REPO` in `hermes.ts#sendMessageViaCli`, and an unused `HERMES_REPO` import in `hermes-agent-compat.ts`). Plan already makes T2 the only writer of those files and T1 Depends On T2. Cursor `T2=completed` is premature for that leftover; finish or reopen T2 before T1 deletes the exports. This is delivery sequencing, not an AC-02 owner/boundary change. |
| N3 | NOTE | `listBundledSkills` may remain as an empty listing API so preload surface stays stable; Discover/Skills must not present `source=bundled`. |
| N4 | NOTE | `stopGateway` / `startGatewayDetailed` exports may remain as refuse/no-op after C04, but they must not spawn or SIGTERM. |
| N5 | NOTE | LIVE ENV-02 is blocked at preflight if `:8642/health` is not 200; that is `VERIFICATION_BLOCKED`, not a product FAIL. |
| N6 | NOTE | Implementation commit must not include Runtime Roadmap DONE. |
| N7 | NOTE | PRD v1.1.2 and this Plan revise mutated ambient PRD/Plan-review bytes during IMPLEMENTING. Do not `workspace.py init --refresh`. Record the drift; resume from `last_valid_state=IMPLEMENTING` after this PASS. |

PASS means this canonical Plan may resume through `smc-plan-delivery` only.
