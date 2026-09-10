# RM-03 Managed Hermes Verification Boundary Closure — PRD Initial Review

Reviewer: independent `smc-prd-review`（七门；initial）
PRD: `docs/work/PRD-WORK-v4.1.2-managed-hermes-verification-boundary-closure.md` v1.0.0 `REVIEW_REQUIRED`
Grounded commit: `a404d7346ce1fb777515bcd67b7bd0a49fc39030`
Date: 2026-09-10

复用 PRD `source_revision` / Evidence Baseline / Source Anchors。未对无关 Work 域做 full discovery。未修改 PRD。

## Verdict

REVISE

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | In 仅听口身份 / Probe 观察字段 / LAT；Out 明确排除 Installer、lifecycle、新 Adapter、`managed-local-v2`、Registry。 |
| G2 Existing Capability | PASS | ProgramRoot、听口检查、LegacyLocal Probe、CLI runner 均已存在；无第二套 Locator/Adapter。 |
| G3 Production Ownership | PASS | 唯一生产 Owner 仍是现有听口检查 + LegacyLocal Probe；Gateway 进程仍属 OPSI/Installer。 |
| G4 Classification | PASS | 身份规则 REPLACE + CommandLine 所有权 REMOVE 有对应 Removal Matrix；lifecycle/CLI/Adapter KEEP。C03 双动作记为 MINOR。 |
| G5 Contract/Security Boundary | PASS | 不 spawn/kill、health 单独不等于 READY、目录边界 fail-closed、合同名不变。信任根从 CLI 映像改为 ProgramRoot 是本 Item 显式产品决定，不把 RM-02 F2 的 argv 门禁当未关闭 blocking FAIL 延后。 |
| G6 Behaviour → AC | REVISE | C01 冻结与 AC-04 对「多监听 / 混合」状态机不一致；CONFLICT 与 `configuration_error` 在「至少一者越界」时重叠。 |
| G7 Acceptance / Evidence Integrity | REVISE | CLM-01/CLM-10 正确保持 FAILED→NEW_EVIDENCE。但 parent v1.1.3 C05/AC-21 与 RM-02 AC-05 仍是 APPROVED 有效听口 oracle，本 PRD 未声明仅替代该条款，Plan 可能 AND 两套规则从而无法关闭现网缺口。 |

## Blocking Findings

无。

## Major Findings

| ID | Finding | Required closure |
|---|---|---|
| M1 | C01 行为冻结与 AC-04 对多监听者的判定冲突。冻结表：全部属于 ProgramRoot → managed；「至少一者不属于 ProgramRoot」→ CONFLICT；「混合互不一致」→ `configuration_error`。AC-04 则把「混合监听」一律打成非 READY，且未定义「混合」是「多个 PID」还是「managed 与 foreign 并存」。同一观察（两进程均在 ProgramRoot 内监听，或一内一外）会在 READY / CONFLICT / `configuration_error` 之间漂移。 | 冻结一张表：全部在边界内（无论几个 PID）→ managed/READY；恰好一个且越界 → CONFLICT；多个且并非全部在边界内 → 选定 CONFLICT **或** `configuration_error` 之一，禁止两行同时适用。AC-04 只引用该表，删除未定义的「混合监听」。 |
| M2 | 现行有效听口合同双源。Parent `PRD-WORK-v4.1.0` v1.1.3 C05/AC-21 与 RM-02 AC-05 仍 APPROVED：合法 listener = `hermes.exe` **或** 同 root python **且** CommandLine 含 CLI 绝对路径 + `gateway`/`run`。本 PRD Replacement Matrix 描述了替换，但未写明 **本 Item 合入后上述听口身份条款不再是生产验收 oracle**（其余 parent AC KEEP）。若不显式 supersede，后续 Plan/Audit 可能同时执行两套规则；AND 后现网 `python -m hermes_cli.main` 仍 CONFLICT，CLM-01/CLM-10 无法关闭。 | 在 Scope / C01 冻结增加：本 Item **仅**替代 parent C05「合法 managed Gateway 进程」定义、AC-21 听口身份、以及 RM-02 AC-05/C03 听口 oracle；CommandLine 不再作为所有权输入。不要重写已 DONE 的 parent 全文，但本 PRD 必须是此后唯一有效的 Windows 听口身份合同。 |

## Minor Findings

| ID | Finding | Suggested closure |
|---|---|---|
| N1 | Change ID C03 同时 MODIFY `runtimeContextVerified` 与 ADD `listenerOwnership`/`listenerExecutable`。 | 拆成两个 Change ID，便于 Plan 继承。 |
| N2 | Current Inventory 将「Windows listen inspect」标为 KEEP/REPLACE 同行。 | 能力 KEEP、身份规则 REPLACE 分两行，与 C01/C02 对齐。 |
| N3 | CLM-02 把 hermes.exe（PROVEN_BUT_AFFECTED）与 node.exe（NOT_TESTED）绑在同一 claim。 | 拆 claim，或在 Observable Fact 中分开 prior result。 |

## Notes

| ID | Note |
|---|---|
| T1 | ProgramRoot 内任意映像（含非 hermes/python/node）在 health+auth 成功时也可 READY。相对 RM-02 F2 的 argv 约束更宽。这是新 RM 的信任根变更（安装树 vs CLI 映像），不是把既有 blocking FAIL 降级为 observation。写入 M2 的 supersede 后即可接受。 |
| T2 | CLM-06/07/09 REUSE_EVIDENCE 合理：本 Item 不改 CLI owner、不重开 spawn/kill、不新增 Adapter。 |
| T3 | AC 未绑定具体测试文件/Tool 名称；Evidence Baseline 中的 `gateway-probe.test.ts` 是 HEAD 事实，不是验收实现绑定。 |
| T4 | Renderer 不展示新字段列为 Out 可接受；Connection Ready 仍以 `state` 为准。 |

## Closure Table

| Finding | Status |
|---|---|
| M1 | OPEN |
| M2 | OPEN |
| N1 | OPEN |
| N2 | OPEN |
| N3 | OPEN |

## Conclusion

退回 `smc-prd-grounding` **revision**：只关闭 M1、M2 及其直接 AC/Claim 对齐。N1–N3 建议同轮修订，不单独阻断。所有权、Adapter 冻结、不 kill、health≠READY 已关闭，不必重开 RM-01。
