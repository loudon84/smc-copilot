# RM-03 Managed Hermes Verification Boundary Closure — PRD Closure Review

Review scope is Stage PRD v1.0.1（`REVIEW_REQUIRED`，`grounding_mode: revision`）相对 initial review 的 OPEN finding，以及本轮 revision 的直接回归。不重开无关域 discovery。未修改 PRD。

Prior: `docs/work/reviews/prd-work-v4.1.2-managed-hermes-verification-boundary-closure-initial-review.md` → REVISE（M1/M2 MAJOR；N1–N3 MINOR）
PRD: `docs/work/PRD-WORK-v4.1.2-managed-hermes-verification-boundary-closure.md` v1.0.1
Grounded commit: `a404d7346ce1fb777515bcd67b7bd0a49fc39030`（未变）
Date: 2026-09-10

## Verdict

PASS

## Blocking Findings

无。

## Major Findings

无。

## Closure Table

| Finding | Status | Closure evidence |
|---|---|---|
| M1 | CLOSED | C01 状态表互斥：行 1 全部 in-boundary（PID 个数不否决）→ `ready`/`managed`；行 2 恰好一个越界 → `conflict`/`foreign`；行 3 多个且并非全部 in-boundary → 仅 `configuration_error`/`unknown`。AC-01/AC-03/AC-04 分别绑定行 1/2/3–5；全文删除未定义「混合监听」。同一观察不再同时适用 CONFLICT 与 `configuration_error`。 |
| M2 | CLOSED | 开篇、Scope「Oracle supersede」、C01、Replacement Matrix、Claim 禁令均写明：合入后本 PRD C01 是 Windows 听口身份唯一生产 oracle；替代 parent C05 合法进程定义、parent AC-21 听口身份、RM-02 AC-05/C03；CommandLine 不再作为所有权输入；其余 parent AC KEEP；禁止 AND。未重写已 DONE parent 全文。 |
| N1 | CLOSED | C03 仅 MODIFY `runtimeContextVerified`；C06 ADD `listenerOwnership`/`listenerExecutable`。 |
| N2 | CLOSED | Windows listen inspect 能力 KEEP；Listen-match identity REPLACE，分两行。 |
| N3 | CLOSED | hermes.exe → AC-02/CLM-02（PROVEN_BUT_AFFECTED）；node.exe → AC-11/CLM-11（NOT_TESTED / NEW_EVIDENCE）。 |

## Regression Check

| Gate | Result | Note |
|---|---|---|
| G1 Scope | PASS | 仍限听口身份 / Probe 观察字段 / LAT；未重开 Installer、lifecycle、新 Adapter。AC-11 是 N3 的直接拆分，不是新能力面。 |
| G2/G3 Ownership | PASS | Owner 仍是现有听口检查 + LegacyLocal Probe；ProgramRoot SOT 仍是 Locator/config。 |
| G4 Classification | PASS | C01 REPLACE + C02 REMOVE 仍有 Removal Matrix；C03/C06 已拆；C05 KEEP。 |
| G5 Boundary | PASS | 不 spawn/kill、health≠READY、目录边界 fail-closed、合同名不变。T1 信任根变更在 M2 supersede 后可接受。 |
| G6 Behaviour → AC | PASS | 状态表与 AC-01/03/04/10 对齐。 |
| G7 Evidence Integrity | PASS | CLM-01/CLM-10 仍为 FAILED → NEW_EVIDENCE；未降级为 observation；禁止用旧听口 oracle 作为本 Item PASS 标准。CLM-06/07/09 仍 REUSE。 |

## Notes

| ID | Note |
|---|---|
| T5 | AC-04 对行 3–5 只禁 `listenerOwnership=managed`，C01 行 3 还禁把 `foreign` 当作单一结论（应为 `unknown`）。状态机已闭合；Plan 以 C01 表为准即可。不构成 MAJOR，不重开 M1。 |

## Conclusion

上一轮全部 OPEN finding 已关闭，无 BLOCKER/MAJOR 回归。PRD v1.0.1 可进入 `smc-prd-converge`。
