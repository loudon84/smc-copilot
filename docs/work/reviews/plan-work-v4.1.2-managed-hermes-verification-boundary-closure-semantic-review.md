---
review_kind: plan_semantic
plan_id: WORK-V4.1.0-RUNTIME-RM-03
plan: .cursor/plans/work-v4.1.2-managed-hermes-verification-boundary-closure.plan.md
prd: docs/work/PRD-WORK-v4.1.2-managed-hermes-verification-boundary-closure.md (v1.0.1 APPROVED)
parent_prd: docs/work/PRD-WORK-v4.1.0-managed-hermes-runtime-ownership-closure.md
prior_stage_prd: docs/work/PRD-WORK-v4.1.0-managed-hermes-verification-closure.md
grounded_commit: f08773030dfa0313519fa4223c48c9667b5d6d63
router: REQUIRED (INTEGRATION_HOTSPOT, COMPLEX_CROSS_TODO_DEPENDENCY); acceptance_contract override
reviewed_at: 2026-09-10
reviewer: smc-plan-review (actual semantic review)
verdict: PASS
---

# Plan Semantic Review — WORK-V4.1.0-RUNTIME-RM-03 Verification Boundary Closure

## Verdict

PASS

Delivery 可以进入 implementation。无 BLOCKER。C01 在 Plan 中为 MODIFY（PRD Classification 为 REPLACE）与 C02 REMOVE 一起构成听口 oracle 替换，不要求 Plan REVISE。

## Gate Results

- **1. Grounding engineering truth — PASS.** HEAD/`grounded_commit` `f0877303`。`isManagedHermesGatewayProcess` 仍要求 CLI 路径相等，或同 install-root `python.exe` 且 CommandLine 含 CLI 绝对路径 + `gateway` + `run`。`inspectGatewayListener` 第二参是 CLI 路径。`probeLocal` 传入 `getHermesCliPath()`。`HermesRuntimeProbe` 无 `listenerOwnership`。LAT Gateway probe 仍写 managed `hermes.exe` listen。与 APPROVED PRD Inventory / 现网 `-m hermes_cli.main` CONFLICT 一致。
- **2. Ponytail minimality — PASS.** 改现有 helper + Probe 字段 + LAT 一段；不新增 Adapter / Locator / HTTP。C01 用 MODIFY_EXISTING 改同一 `path#symbol`，C02 REMOVE_ONLY 删除 CommandLine 所有权分支。
- **3. Change Matrix vs real owner/symbol — PASS.** 所列符号均存在：`isManagedHermesGatewayProcess`、`inspectGatewayListener`、`HermesRuntimeProbe`、`probeLocal`、`fail`、`getHermesProgramRoot`、`hermes-cli-runner.ts` KEEP。
- **4. Single Writer / hotspots — PASS.** 三个 hotspot 文件均由 T1 单写；T2 只写 LAT；T3/T4 无 matrix write。T2 读 `gateway-probe.ts` 且 Depends On T1。
- **5. Requirement Coverage AC/DoD mapping — PASS.** AC-01–AC-11 与 DOD-01–DOD-03 均有 Change/Todo/blocking Verification。AC-10 的 foreign 子句与 AC-03/CLM-03/V02 同构；LIVE 只证明托管 READY 残余缺口，合理。
- **6. Lifecycle writers — PASS.** Probe 成功/失败仍由 `probeLocal` 单写；禁止 kill PID。
- **7. Cross-boundary producer/transport/consumer — PASS.** OS ExecutablePath → inspect 结果 → Probe 字段；失败映射 C01 行 1–5。
- **8. Verification command/oracle/negative — PASS.** V01/V02 覆盖 python -m / hermes.exe / node.exe / sibling / foreign / rows 3–5。V03 禁止 `managed hermes.exe` 子串。V04 LIVE 走 ENV-02 COMMAND，不是 LOCAL_WORKTREE。V08 completion audit。
- **9. PRD scope drift — PASS.** 不重开 Gateway supervisor / 新 Adapter / CLI python module。合入后本 PRD 为唯一 Windows 听口 oracle。
- **10. Cursor Todo vs Markdown Todo — PASS.** T1–T4 投影与 Owns Changes 一致。
- **11. LIVE scenarios — PASS.** SCN-01 绑定 CLM-10/V04；fixture 为已拉起的托管 Gateway + Work Probe；Required Capabilities 匹配。
- **12. Fixture reuse — PASS.** 仅一个 LIVE scenario。
- **13. Evidence reuse — PASS with inherit map.** V05–V07 REUSE_EVIDENCE 且 Prior Result PASS、Invalidation `-`。继承源为 RM-02 durable manifest（见下）。CLM-01/CLM-10 现场 FAIL 均为 NEW_EVIDENCE，未降级。
- **14. Blocking claims — PASS.** 已知 CONFLICT 不得改写成 observation。TARGETED_RERUN（CLM-02–04）有 invalidation reason。
- **15. Live Environment / Candidate Mode — PASS.** ENV-02 Candidate Mode = COMMAND；preflight 检查 `:8642/health` 与 ProgramRoot 内 `hermes.exe`/`python.exe`。Gateway 是预部署 SUT，未误标 LOCAL_WORKTREE。

## Evidence inheritance map (Phase 6)

| Current | Source manifest | Source verification | Why |
|---|---|---|---|
| V05 | `docs_agent/evidence/WORK-V4.1.0-RUNTIME-RM-02-evidence.json` | V01 | RM-02 CLI/path unit；本 Item 不改 `hermes-cli-runner` |
| V06 | 同上 | V03 | RM-02 `npm run guard` 含 `check:no-work-gateway-spawn` |
| V07 | 同上 | V03 | 同上含 `check:runtime-adapter-contract` |

## Findings

| ID | Severity | Status | Note |
|---|---|---|---|
| F-01 | LOW | ADVISORY | PRD C01 Action=REPLACE，Plan C01 Action=MODIFY + C02 REMOVE。语义是替换听口 oracle，文件级是改同一 helper；满足 `PLAN_REPLACEMENT_WITHOUT_REMOVAL`，不要再改回 REPLACE。 |
| F-02 | LOW | ADVISORY | 现网 conflict 文案含 “Do not stop that process”；AC-07 禁止指示 stop。T1 必须删掉 stop 用语，只陈述越界所有权与 OPSI 修复归属。 |
| F-03 | LOW | ADVISORY | `inspectGatewayListener` 的 `mixed_listeners` 在「并非全部 in-boundary」时已是 `inspect_failed`（行 3）。T1 须保证全部 in-boundary 的多 PID 走 `match`（行 1），不要用 PID 个数否决。 |

## Review Closure

```bash
python .agents/skills/smc-plan-delivery/scripts/review_record.py plan \
  --plan .cursor/plans/work-v4.1.2-managed-hermes-verification-boundary-closure.plan.md \
  --verdict PASS --reviewer smc-plan-review \
  --note "docs/work/reviews/plan-work-v4.1.2-managed-hermes-verification-boundary-closure-semantic-review.md"
```
