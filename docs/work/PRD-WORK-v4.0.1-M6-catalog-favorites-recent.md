---
work_item_id: RM-12
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.0
review_verdict: PASS
approved_at: 2026-09-07T13:00:00+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-12
grounded_commit: 4bfaa452ea147901a23c8ba94a946b7fbb991a69
grounding_mode: discover
provider_contract: SKILL-RUN-CONTRACT v1.2.1
product_decision: user-input:2026-09-07-continue-next-rm-prd-skip-unrelated-docs
---

# WORK PRD v4.0.1 M6f — Catalog Favorites and Recent Use

本 Stage PRD 关闭 Roadmap RM-12 中 **Work 可独立证明** 的子集：在现有 Skill Catalog 上叠加本机 **收藏** 与 **最近使用**，且成员必须来自当前 auth scope 的 Main Catalog cache。不新增第二 Catalog owner，不绕过 `tools/list` cache，不发明组织推荐 HTTP，不修改 Provider Bundle。

顺序上 RM-09（Approval decision）与 RM-11（Attachment）的 Exit Criteria 要求新 Bundle 先关闭 `approval` / `attachments` 的 `unsupported` 并补齐 endpoint；当前 v1.2.1 未满足，**禁止**为本对话开 RM-09 / RM-11 Stage PRD。RM-12 依赖 RM-07（已 DONE），是当前唯一可独立 Grounding 的剩余 M6 Item。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-12` / M6f P1 收藏、最近使用与组织推荐 |
| Roadmap source | `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-12` |
| Architecture | 父 PRD Catalog 由 Main `SkillRunGatewayClient` 消费 `tools/list` 并按 auth scope 缓存；Renderer `modules/skill-run` 只展示 sanitized Catalog，不拥有网络与会话 truth。旧 draft 5.3 曾列「Tool 收藏、最近使用和组织级推荐」；已批准 v4.0.1 P1 列表未单列该项，本 Item 以 Roadmap Exit Criteria 为交付闸门，且不得因此发明 Provider 推荐合同。 |
| Repository baseline | `4bfaa452ea147901a23c8ba94a946b7fbb991a69` |
| Dependencies | RM-07 is `DONE`。Catalog Panel 已有搜索/分类与 `callability === "callable"` 选择；Main Catalog 按 auth scope 缓存 `tools/list`。 |
| Provider input | `contracts/skill-run/v1.2.1/`。Catalog 是 `tools/list`。无 favorite / recent / recommend schema 或 endpoint。`approval` 与 `attachments` 仍 `unsupported`。 |
| Current Catalog HTTP | `SkillRunGatewayClient.listCatalog` 以 auth scope key 缓存；`refreshCatalog` 清缓存后重拉。Renderer store 只镜像该响应。 |
| Current Catalog UI | `SkillCatalogPanel` 按 category + 本地 search 过滤 `catalog.tools`；无收藏/最近分组。 |
| Current preference stores | `skill-run-feature-mode.json` 只存 feature mode。`desktop_session_skill_run_mode` 只存 **每个 session** 的 tool 展示，不是用户级 Catalog 偏好。 |
| Current recent signal | 接受的 `skillRun.start` 会走 Main，但没有用户级 recent 列表。Telemetry JSONL 不是产品 Catalog 真源。 |
| Out of this Item | RM-09 Approval；RM-11 Attachment；组织级推荐（无 Bundle 字段）；第二 Catalog HTTP / 绕过 cache；本地 Hermes `screens/Skills`；Expert 收藏；通用推荐引擎。 |

## Problem and Outcome

员工每次进入 Skill mode 都面对同一扁平 Catalog。P0 正确地只展示 Main 已证明的 Skill 列表。没有本机收藏/最近使用时，高频工具只能靠搜索或滚分类。若错误地让 Renderer 自建第二份 Catalog、直读 telemetry、或在无合同情况下排序「组织推荐」，会绕过 Main cache、泄漏跨账号偏好，或把猜测排名当 Provider 事实。

完成后：

- 用户可在现有 Catalog Panel 收藏/取消收藏当前 Catalog 中的 `toolName`；收藏列表只含当前 Main Catalog 仍存在的项。
- 最近使用只记录 **被 Main 接受的 Skill start** 的 `toolName`，按时间倒序；未在当前 Catalog 中的名字丢弃。
- 收藏与最近使用按 **与 Catalog cache 相同的 auth scope** 分区；logout / 账号切换不得串数据。
- 组织推荐继续缺失：不展示伪推荐区，不新增推荐 HTTP，不把分类/标题猜成组织策展。
- 选择、start、`tools/call`、prompt-first / limited-parameter-form 行为不变。无第二 Catalog owner。

## Scope

- In: 在现有 Main Skill Run 表面增加 bounded 本机收藏与最近使用偏好；用当前 Catalog 工具集做交集后，在现有 `SkillCatalogPanel` 展示分组；accepted start 写入最近使用；偏好读写走现有 skill-run IPC 表面的狭窄扩展，不新增 Catalog list endpoint。
- Out: 组织级推荐 / 策展 API；绕过 Main `tools/list` cache 另拉一份工具列表；把 telemetry JSONL 当 recent SOT；把 session-mode 表当用户级收藏；Approval / Attachment / 表单引擎；修改 `contracts/skill-run/v1.2.1`；本地 Hermes Skills 管理页；Expert 技能收藏；跨设备云同步。
- Production Owner: Main 拥有偏好持久化与 auth-scope 分区，以及「名字必须能在当前 Catalog 命中」的交集。Gateway Catalog cache 仍是工具列表唯一 HTTP owner。Renderer `modules/skill-run` 拥有收藏/最近分组展示与收藏切换手势。Chat 仍是唯一 Skill selection / submit owner；收藏不把 selection 搬到 Layout。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| Catalog HTTP + auth-scope cache | Main `SkillRunGatewayClient` | `tools/list` 按 scope 缓存；refresh 清缓存 | EXISTS |
| Catalog DTO / IPC list | Shared Skill Run DTO + existing list/refresh channels | 投影 tool 列表与 callability；无 favorite/recent 字段 | EXISTS |
| Catalog presentation | Renderer `SkillCatalogPanel` | 搜索 + 分类过滤同一 `catalog.tools` | PARTIAL |
| Per-session selected tool display | Session-mode store | 按 `session_id` 存 toolName/title | EXISTS（禁止复用为用户级收藏） |
| Feature mode persistence | Feature-mode store | 只存 mode | EXISTS（禁止复用为收藏列表） |
| Accepted Skill start | SkillRunService | 已有 accepted 路径；不写 recent 列表 | PARTIAL |
| User Catalog favorites | n/a | 不存在 | MISSING |
| User Catalog recent | n/a | 不存在 | MISSING |
| Org recommendations | Provider contract | Bundle 无字段/endpoint | MISSING（本阶段不 ADD） |
| Local Hermes Skills page | `screens/Skills` | 管理 bundled skills，不是员工 Catalog | KEEP 不纳入 |
| Approval / Attachment | Provider capability | 仍 `unsupported` | KEEP absent |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| Auth-scoped favorite tool names | New Main preference owner beside existing Skill Run Main stores | 只存 `toolName` 字符串集合；有上限；按 Catalog auth scope 分区 | ADD |
| Auth-scoped recent tool names | Same Main preference owner | 只在 start **accepted** 后写入；有上限；倒序；按同一 auth scope 分区 | ADD |
| Catalog overlay membership | Main + existing Catalog DTO | 展示用成员 = 偏好名字 ∩ 当前 Catalog `tools`；缺失或已下架的名字不展示、不复活为可选项 | MODIFY |
| Catalog Panel groups | Existing `SkillCatalogPanel` | 在现有搜索/分类之上展示 Favorites 与 Recent 分组；成员仍走现有选择门（`callability === "callable"` 才可选） | MODIFY |
| Record recent on accepted start | Existing SkillRunService start | 不在仅选择 Skill、被拒 start、或 Expert start 时写入 | MODIFY |
| Gateway `tools/list` cache | Existing Gateway | 行为不变；偏好不得触发第二份 list HTTP | KEEP |
| Org recommendations | n/a | 继续缺失；无推荐分组、无猜测排序 | KEEP absent |
| Session-mode / feature-mode / telemetry | Existing owners | 不改语义；telemetry 仍非 Catalog SOT | KEEP |
| Approval / Attachment / Bundle / Expert | 对应 Owner | 不修改 | KEEP |

## Change Classification

| Change ID | Capability | Action | Rationale |
|---|---|---|---|
| C01 | Auth-scoped favorite + recent preference store | ADD | 无等价用户级 Catalog 偏好 owner。session-mode 与 feature-mode 能力不同，禁止混用。这是 Main 本机 store，不是第二 Catalog HTTP client。 |
| C02 | Overlay 当前 Catalog 成员 | MODIFY | 现有 Catalog DTO/list 路径承载交集；Renderer 不得另拉工具列表或发明不在 Catalog 中的卡片。 |
| C03 | Catalog Panel Favorites / Recent 分组 | MODIFY | 现有 Panel 已是唯一员工 Catalog UI owner；禁止新 Catalog 页面或改 `screens/Skills`。 |
| C04 | Accepted start 写入 recent | MODIFY | SkillRunService 已是 start 接受点；选择-only 与 rejected start 不得记为「使用」。 |
| C05 | Gateway Catalog cache / `tools/list` | KEEP | Roadmap Exit Criteria：不得新增第二 Catalog owner 或绕过 cache。 |
| C06 | Org recommendations | KEEP absent | v1.2.1 无 recommend 合同。禁止伪推荐。 |
| C07 | Approval / Attachment / Bundle / Expert / 表单 | KEEP | 分属 RM-09/11/10 与 Provider。 |

## Replacement / Removal Matrix

本 Item 无 REPLACE。不删除 Gateway Catalog cache。不删除 session-mode。不删除本地 Hermes Skills 页。不把组织推荐做成可事后删除的兼容层。

## Behaviour — Overlay subset

1. **Identity.** 收藏与最近使用的唯一键是 Skill Run `toolName`（与 Catalog / start 相同）。不使用 `(expertSlug, skillName)`。
2. **Intersection.** UI 分组里出现的每一项必须能在 **当前** Main Catalog `tools` 中找到同名条目。Catalog 未 ready、空、或该名已不在列表中：不展示、不可选。
3. **Favorites.** 用户可对当前 Catalog 中的工具收藏或取消收藏。集合有上限（实施冻结，建议 ≤ 50）。超出 fail-closed（拒绝新收藏，不静默丢最旧项除非 PRD 后续修订）。重复收藏幂等。
4. **Recent.** 仅当 `skillRun.start` **accepted** 时把该次 `toolName` 记到该 auth scope 的 recent 列表头部；同一名字再次使用则移到头部。上限建议 ≤ 20，超出丢弃最旧。rejected start、feature-mode 拒绝、仅选择未发送，均不写入。
5. **Auth scope.** 分区键与 Catalog cache 的 auth scope 对齐。账号 / org / generation 变化后不得读到上一 scope 的偏好。
6. **Selection.** 分组内选择仍遵守现有 callability 门；不可调用卡片不可选。Chat 仍是唯一 selected Skill owner。
7. **Org recommendations.** 不渲染推荐分区，不调用不存在的推荐 API，不把 `category` 或任意排序冒充组织推荐。
8. **English-only** 新文案。

## Contract and Security Boundary

- 工具列表真源仍是 Main Catalog cache / `tools/list`。偏好 store 只存名字，不存 raw schema、JWT、origin、inputSchema。
- Renderer 不得把 localStorage / 未分区文件当作跨窗口 SOT 而绕过 Main。
- 偏好读写若需 IPC，只扩展现有 `window.hermesAPI.skillRun` 表面；不新增第二条 Catalog list；不新增执行 channel 替代 `skillRun.start`。
- 不得编辑 `contracts/skill-run/v1.2.1`。不得扫描 Provider 源码补推荐字段。
- telemetry 若记录 start，仍遵守 M5 允许名单；不得把 telemetry 文件回读成 recent 列表。

## Acceptance Criteria

1. 用户收藏当前 Catalog 中的可调用工具后，同一 auth scope 再次打开 Catalog 能在 Favorites 分组看到该项，且选择后仍走现有 Chat selection。
2. 收藏一个当前 Catalog 不存在的名字（伪造 IPC）：Main 拒绝或交集后不出现该卡片，不得因此新增 tools/list 请求去「找回」它。
3. 一次 accepted Skill start 之后，该 `toolName` 出现在 Recent 分组（若仍在当前 Catalog）。现有搜索/分类过滤同样作用于分组；任何分组都不得插入当前 Catalog `tools` 中不存在的项。
4. rejected start 或仅选择不发送：Recent 不增加该次记录。
5. 切换到另一 auth scope 后，看不到上一 scope 的收藏/最近使用。
6. Catalog 为 contract-unsupported / unauthorized / empty 时，不展示幽灵收藏卡片。
7. 不出现组织推荐分区；源码与 Bundle 不因本 Item 增加 recommend endpoint。不新增第二套 Catalog HTTP owner。Local Chat / Expert 回归不因收藏改变默认入口。

## Definition of Done

1. C01–C04 有 Main 偏好 / 交集 / Catalog 分组 / accepted-start recent 的 focused tests，并覆盖 AC-02/AC-04/AC-05/AC-06 负向。C05–C07 由既有 Catalog cache、Expert/Local、Bundle unsupported 套件回归。
2. RM-12 只有在本 PRD AC 全部通过后，才以独立 Roadmap status commit 标为 `DONE`。implementation commit 不得包含该 status 更新。
3. 发现需要组织推荐合同、云同步、第二 Catalog、Approval 或 Attachment 的工作，必须返回对应 Roadmap Item / Provider，不得混入本 Item。

## Source Anchors

- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#listCatalog`
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/skill-run/skill-run-ipc.ts`
- `apps/work/src/main/skill-run/skill-run-session-mode-store.ts`
- `apps/work/src/main/skill-run/feature-mode-store.ts`
- `apps/work/src/shared/skill-run.ts#SkillCatalogToolItem`
- `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx#SkillCatalogPanel`
- `apps/work/src/renderer/src/modules/skill-run/store.ts`
- `contracts/skill-run/v1.2.1/capabilities/unsupported.schema.json`
- `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md`
