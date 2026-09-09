---
roadmap_id: WORK-MANAGED-HERMES-RUNTIME-V4.1.0
version: 1.2.1
status: ACTIVE
architecture_decision: docs/work/PRD-WORK-v2.4-opsi-managed-hermes-runtime-Integration.md
source_revision: PRD-WORK-v2.4@managed-runtime/v4.1.0-ownership-closure
target_branch: work/prd-v4.1
updated_at: 2026-09-10T07:20:00+08:00
implementation_plan_required: true
architecture_approval_note: parent-v2.4-predates-yaml-approved-frontmatter
---

# ROADMAP — Work v4.1.0 Managed Hermes Runtime Ownership Closure

本路线图是 **Hermes Runtime / Data Plane** 交付 SOT，与 Skill-First / Skill Run 路线图分离。禁止把本项登记为 `ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md` 的 RM-13、RM-14 或任何 M6 后续。

## Architecture Decision

父架构：[`PRD-WORK-v2.4-opsi-managed-hermes-runtime-Integration.md`](PRD-WORK-v2.4-opsi-managed-hermes-runtime-Integration.md)（ADR-01/02/05/07，AC-07/08/09/18）。该文档早于现行 YAML `APPROVED` frontmatter；本 Roadmap 不把它改写成新的 Architecture Decision，只交付其未关闭的 Self-Install / Gateway 监护残留。

Stage PRD 不得把 Skill Run 合同或 `AD-WORK-v4.0.1-STREAMING-DELTA` / `AD-WORK-v4.0.1-SKILL-RUN-TRANSCRIPT-LIVE-SYNC` 当作本项架构出处。

## Delivery Invariants

- One Roadmap Item → one Stage PRD.
- DONE 需要 implementation commit + verification evidence.
- Work 不是 Hermes Gateway Process Owner；OPSI / Managed Installer 才是。
- 不新增 Runtime Adapter；不修改 Hermes 打包；不虚构 Gateway `/api/*`。

## Roadmap Items

| Item ID | Outcome | Depends On | Status | Exit Criteria | PRD | Plan | Implementation Commit | Verification Evidence |
|---|---|---|---|---|---|---|---|---|
| RM-01 | Managed Hermes Runtime Ownership Closure：`apps/work` 仅为 Data Plane Client。无 Self-Install Python Runtime；任何 control owner（含默认 `direct`）都不 start/stop/kill Gateway；Local Chat 单传输连接托管 Gateway；管理 CLI 经绝对路径 `hermes.exe`；Probe 能区分 UNAVAILABLE 与 CONFLICT；`managed-local-v1`（含 `direct`）下 Self-Install UI 不可达。 | - | DONE | AC-01–AC-21 PASS（v1.1.3：AC-20 不含 package-wide typecheck；AC-21 接受同 install-root python launcher）；无 Python/source Runtime 生产残留；无 Work Gateway lifecycle；托管真机 Chat 与 CLI 可用；CONTEXT LIVE 若失败则阻断并单独立 Installer defect，不回退 Python Runtime。 | docs/work/PRD-WORK-v4.1.0-managed-hermes-runtime-ownership-closure.md | .cursor/plans/work-v4.1.0-managed-hermes-runtime-ownership-closure.plan.md | cb562e91 | external-artifact:docs_agent/evidence/WORK-V4.1.0-RUNTIME-RM-02-evidence.json |
| RM-02 | Managed Hermes Verification Closure：不重写 RM-01 Data Plane Client 实现；以已提交实现 `cb562e91` 为 grounding，收口 governed audit/review/LOCAL+LIVE verification 与 durable evidence；修正听口匹配以识别 managed `python.exe` 托管启动 `hermes.exe gateway`；package-wide typecheck 登记为独立 baseline restoration，不作为本 Item 阻断。 | - | DONE | Completion audit PASS；implementation review PASS；parent LOCAL V01–V03/V06/V07/V09/V11 fresh PASS；listen-match oracle 接受 managed python launcher；LIVE V04/V05/V08/V10/V13 fresh PASS 或按 PRD 明确 BLOCK+defect；durable evidence manifest 存在；RM-01 DONE（Plan=RM-01 canonical Plan、Commit=`cb562e91`、Evidence=`external-artifact:docs_agent/evidence/WORK-V4.1.0-RUNTIME-RM-02-evidence.json`）；RM-02 DONE（Plan=RM-02 Plan、Commit=RM-02 impl commit、Evidence=`smc-evidence:WORK-V4.1.0-RUNTIME-RM-02@sha256:<scope-fingerprint>`）。 | docs/work/PRD-WORK-v4.1.0-managed-hermes-verification-closure.md | .cursor/plans/work-v4.1.0-managed-hermes-verification-closure.plan.md | ee396949 | smc-evidence:WORK-V4.1.0-RUNTIME-RM-02@sha256:e005c940ba3311a6bdec9a172e69b0d992f0d00d6653269ff2dcd70431d143cf |

## Critical Path

```text
RM-01 DONE (cb562e91; evidence via RM-02 external-artifact)
  → RM-02 DONE (ee396949; smc-evidence fingerprint)
```

不依赖 Skill-First RM-01–RM-15。不打开 Skill Run streaming / transcript Item。

## Out of this Roadmap

- Skill Run / Expert / Catalog（既有 Skill-First Roadmap）
- Hermes Gateway 新增 `/api/*`（`WORK-HERMES-EXTENDED-API`）
- Credential / `.env` ACL（`WORK-HERMES-CREDENTIAL-HARDENING`）
- `infra/windows/hermes-agent` 打包与 Installer（除非 LIVE 证明 cwd 错误来自 Installer，则本 Item BLOCK，另立 defect）
- `apps/desktop`
