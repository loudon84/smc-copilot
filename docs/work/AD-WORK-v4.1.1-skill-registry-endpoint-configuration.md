---
decision_id: AD-WORK-v4.1.1-SKILL-REGISTRY-ENDPOINT-CONFIGURATION
version: 1.0.1
status: APPROVED
target_branch: work/prd-v4.1
review_verdict: PASS
approved_at: 2026-09-10T10:26:45+08:00
source_revision: WORK-PRD-v4.1.1@local-2026-09-09 + user-input:2026-09-10-complete-endpoint-descriptor
grounded_commit: 2afa1963934432cae28c1000e91a678d739c6a8d
---

# AD-WORK-v4.1.1 — Skill Registry Endpoint Configuration

本 Decision 定义 Work Desktop 的 Discover Registry 如何由发行包选择公共或企业 Endpoint Descriptor，同时保持现有 Main Registry owner、Renderer 边界和 Hermes Runtime ownership 不变。

## Problem

`apps/work` 的 Discover 市场目前在 Main 中以 GitHub 专用常量读取统一 catalog、模型目录、详情、图标和安装文件。企业发行包需要改用内部 Registry，但单个 Git clone URL 无法表达现有读取链依赖的 raw content、tree、web 和 icon endpoint，也不能安全地由 Work 猜测 Git 服务商 URL 规则。

输入需求提出 build-time 配置、runtime 配置和公共默认值三级来源，并要求企业包配置错误可发现、不得静默回落。用户进一步确认：配置覆盖整个 Discover Registry（skills、MCP、agents、workflows、models），并采用完整 Endpoint Descriptor，而不是单一 `.git` URL。

## Decision Drivers

- 企业 Electron 包必须能选择内部 Registry，Community/开发包继续使用公共 Registry。
- 一个 Registry source 必须覆盖 catalog、model、detail、download、homepage 和 icon 链路，不能只改变首页列表。
- 现有 `registry.ts` 已拥有网络访问、缓存、详情和安装行为，应扩展而不是创建第二 Registry client。
- Main 是 catalog/content/tree 网络与文件写入边界；Renderer 不读取打包资源、不解析 descriptor，也不自行选择 endpoint。现有派生后的 item homepage 与 HTTPS icon `<img>` 是受限展示例外。
- Build source 优先于 runtime source；已选择企业 build descriptor 时，环境变量不能把发行包切回其他 Registry。
- 配置缺失可以使用公共默认值；显式配置无效或不可达必须 fail closed，不能静默切换来源。
- Descriptor 不携带 token、密码或带 userinfo 的 URL；认证能力不在 v4.1.1 范围内。

## Evidence Baseline

| Claim | Type | Evidence |
|---|---|---|
| Discover Registry 的 catalog/detail/install/model 由同一 Main 模块拥有 | SOURCE_FACT | `apps/work/src/main/registry.ts`：`fetchRegistry`、`fetchModelRegistry`、`fetchRegistryDetail`、`installRegistryItem` |
| 当前实现由 GitHub repo/branch 派生 raw、tree、web、icon URL | SOURCE_FACT | `apps/work/src/main/registry.ts`：`REGISTRY_REPO`、`REGISTRY_RAW_BASE`、`REGISTRY_REPO_BASE`、`REGISTRY_ICON_BASE`、`TREE_URL` |
| Discover 和 Tools 经既有 Main IPC 消费 Registry，不直接联网 | SOURCE_FACT | `apps/work/src/main/ipc/register.ts` `registry-*` handlers；`apps/work/src/preload/index.ts` Registry methods；`apps/work/src/renderer/src/screens/Discover/Discover.tsx`；`apps/work/src/renderer/src/screens/Tools/Tools.tsx` |
| Skill/MCP/workflow 安装需要列举并下载 Registry 目录文件 | SOURCE_FACT | `apps/work/src/main/registry.ts`：`listFolderFiles`、`downloadFolder`、`installRegistryItem` |
| Work 已有打包资源生成与 `extraResources` 注入模式 | REPO_FACT | `apps/work/scripts/generate-work-build-info.mjs`；`apps/work/electron-builder.yml` |
| 现有 Hermes Runtime Descriptor 只拥有 home/CLI/Gateway discovery | REPO_FACT | `apps/work/src/main/runtime/hermes-runtime-config.ts`；`apps/work/lat.md/runtime-connection.md` |
| 配置覆盖整个 Discover Registry | USER_CONSTRAINT | 2026-09-10 用户选择方案 1 |
| 使用完整 Endpoint Descriptor，不猜测 GitLab URL | USER_CONSTRAINT | 2026-09-10 用户确认完整 Endpoint Descriptor 方案 |
| 输入报告要求 build > runtime > default 且显式错误不静默回落 | SOURCE_FACT | `reports/WORK PRD v4.1.1.md` §8、§25 |

## Current Capability

| Capability | Production Owner | State |
|---|---|---|
| Registry catalog/model/detail/download | `apps/work/src/main/registry.ts` | EXISTS，GitHub endpoint 固定 |
| Registry Main IPC / preload bridge | `apps/work/src/main/ipc/register.ts` + existing preload API | EXISTS，传递 sanitized catalog/action DTO |
| Registry Renderer | Discover、Tools、Registry Browser | EXISTS，不拥有 endpoint |
| Build resource generation | Work build scripts + electron-builder `extraResources` | EXISTS，可扩展 |
| Hermes runtime descriptor | Managed Runtime config owner | EXISTS，仅 home/CLI/Gateway；不是 Registry config owner |
| Generic Registry Endpoint Descriptor | — | MISSING |
| Build profile → descriptor artifact | — | MISSING |

## Options Considered

1. **完整 Endpoint Descriptor + 现有 Main Registry owner。** Build/runtime/default 都解析为同一 descriptor；现有 Registry 模块消费解析结果。
2. **从单一 `.git` URL 推导 GitHub/GitLab endpoint。** Work 根据 host 猜测 raw/tree/web/icon API。
3. **运行时 `git clone/pull` Registry。** Main 依赖系统 Git、维护本地 clone/cache/凭据和更新生命周期。
4. **把 Registry URL 写进现有 Hermes Runtime Descriptor。** 复用 `hermes-runtime-config.ts` 与企业 machine descriptor。
5. **只替换 skills endpoint。** 其他 catalog 类型和 models 继续公共来源。

## Decision

选择 Option 1。

- 定义一个版本化的 `WorkRegistryEndpointDescriptor`，至少表达 registry identity、catalog index、models index、raw content base、recursive tree/list endpoint、web base 与可选 icon base。所有读取和安装 URL 均来自同一已解析 descriptor。
- Descriptor source 固定为 `build | runtime | default`，优先级为 `build > runtime > default`。`build` 指打包资源中存在且校验通过的 descriptor；`runtime` 指无 build descriptor 时由明确 runtime 配置提供的完整 descriptor；`default` 是源码中的公共完整 descriptor。
- Build/runtime descriptor 一旦存在但结构、URL 或协议无效，初始化失败并返回稳定的 sanitized `SKILL_REGISTRY_CONFIG_INVALID`；endpoint 请求失败返回 `SKILL_REGISTRY_UNAVAILABLE`。两者都不得静默回落到下一来源。
- catalog/models/content/tree/web 只允许 `http:`/`https:`；`iconBaseUrl` 若存在必须为 `https:`，以保持现有 Renderer CSP。所有 URL 拒绝 userinfo、`file:`、`data:` 和隐式相对值。允许 Main 访问企业内网 HTTP 是本版本的显式产品约束；认证 header/token 不进入 descriptor、日志或 Renderer。
- `registry.ts` 保持唯一 Registry network/cache/detail/install owner；resolver/loader 只是其配置输入，不建立第二 client/cache/store。
- 不修改 Hermes Agent、Hermes CLI、Skill Run contract、现有 Hermes Runtime Descriptor 或 Registry repository。
- v4.1.1 不新增 Renderer 配置 IPC。现有 `registry-*` IPC 继续只返回 catalog/action 结果；`RegistryItem` 可继续携带由 Main 从 descriptor 派生的 homepage 和 HTTPS icon URL，但不暴露 descriptor/base endpoint。可观测 source 进入 Main 结构化日志和测试证据。

## Target Architecture

```text
Build profile input
  -> deterministic descriptor generator
  -> packaged Work registry descriptor
                                   \
Runtime complete descriptor --------> Main descriptor loader/validator
Public complete descriptor ---------/       |
                                            v
                                  existing registry.ts owner
                           catalog/models/detail/tree/download/cache
                                            |
                                            v
                                  existing sanitized IPC
                              (item homepage/HTTPS icon only)
                                            |
                                            v
                                      Discover / Tools
```

Descriptor 是 endpoint contract，不是 Git provider adapter。Main 不从 clone URL、host 名或 Git service 品牌推导路径。Build artifact 必须可离线检查：包含 schema version、source identity 和全部必需 endpoint，但不包含 secret。

缓存必须绑定 descriptor identity；source/descriptor 改变时不能复用上一 Registry 的 catalog、model 或 tree cache。单次进程初始化后 source 保持稳定，避免不同页面在运行中看到混合 Registry。

## Ownership & Boundaries

| Capability | Production Owner | Boundary |
|---|---|---|
| Endpoint Descriptor schema/default/validation | Work Main Registry configuration boundary | 只产生 validated descriptor；不联网、不安装 |
| Build profile compilation and resource inclusion | Existing Work build pipeline | 确定性生成，不把企业地址写进通用源码默认值，不含 secret |
| Catalog/model/detail/download/cache | Existing `apps/work/src/main/registry.ts` | 所有 URL 来自 validated descriptor；错误 sanitized |
| Registry IPC | Existing Main IPC/preload Registry surface | 不接受 Renderer URL，不暴露 descriptor/base endpoint 或本地路径；保留派生 item homepage/HTTPS icon 字段 |
| Discover/Tools presentation | Existing Renderer owners | 只消费 catalog/action DTO；可加载 Main 派生的 HTTPS icon，不选择 source、不读取 descriptor |
| Hermes home/CLI/Gateway descriptor | Existing Managed Runtime config owner | KEEP；不得加入 Registry endpoint |
| Enterprise Registry content/service | External Registry owner | Work 不定义审核、发布、权限或仓库结构治理 |

## Dependencies & Cascading Effects

- Build generator 必须先产出可校验 descriptor，electron-builder 才能把它作为 resource 打包；缺少企业 profile 输入时企业构建应失败，而不是产出公共包。
- Registry client 改为 descriptor 后，catalog、models、detail、tree、download、homepage 和 icons 必须一起切换；任一仍访问公共 endpoint 都是混源失败。
- Tools 页复用 Registry MCP icons，因此也会随整个 source 切换；这是用户选择“整个 Discover Registry”的预期级联。
- 现有 CSP 仅允许 HTTPS remote images。企业 Registry 使用 HTTP 时可以省略 `iconBaseUrl`；不得为本 Stage 放宽全局 `img-src`，也不得新增 Main icon proxy。
- Runtime source 只有在包内没有 build descriptor 时生效；开发环境可通过完整 runtime descriptor 验证企业 endpoint，而无需制作安装包。
- Endpoint source 改变时清空三类现有缓存；不得跨 source 复用数据。
- Windows installer 验证必须检查 packaged resource，而不能只检查源目录生成文件。

## Risks & Kill Criteria

| Risk | Mitigation | Kill criterion |
|---|---|---|
| 企业只提供 clone URL，缺少 raw/tree HTTP endpoint | descriptor 要求完整 endpoint；发布前做 profile preflight | 任一必需 endpoint 未定义或无法提供，停止企业构建，不在 Work 猜 URL |
| catalog 与 detail/download 混用不同 Registry | 单 descriptor + identity-bound cache + integration test | 发现公共 endpoint 请求出现在企业场景，阻止发布 |
| build/runtime 优先级导致意外覆盖 | source 决策一次、日志记录 source/identity、矩阵测试 | 企业 build 可被 env 改写时阻止发布 |
| 内网 HTTP 被扩大为任意不安全协议 | 仅 http(s)，拒绝 userinfo/file/data；URL 只来自 trusted Main config | Renderer 可提供 URL、descriptor 含凭据或日志泄露 query/userinfo 时返回架构 |
| HTTP icon 诱发全局 CSP 放宽 | `iconBaseUrl` 限 HTTPS；HTTP Registry 可无 icon | 需要允许 Renderer HTTP image 或新增 icon proxy 时返回架构修订 |
| 新 config 模块成为第二 Runtime Config owner | Registry descriptor 独立且只服务 Registry owner | 修改 `HermesRuntimeConfig` 以承载 Registry 时审查失败 |
| tree API 语义与目标服务不兼容 | descriptor contract 明确响应形状，企业 profile 使用 contract fixture/preflight | 需要按 host 写 GitLab/GitHub 分支判断时返回架构修订 |

## Rejected Alternatives

- **从 `.git` URL 自动推导 endpoint。** 拒绝：GitHub/GitLab/私有服务的 raw、tree、icon 与认证规则不同，URL 推导会形成隐式 provider adapter 和长期兼容负担。
- **运行时 clone/pull。** 拒绝：新增 Git 可用性、凭据、目录锁、更新、清理和供应链验证责任，远超 endpoint 配置目标。
- **复用 Hermes Runtime Descriptor。** 拒绝：该 descriptor 的 Production Owner 是 Managed Runtime discovery；加入 Registry 会耦合机器安装配置与 Work 发行内容。
- **只切换 skills。** 拒绝：用户已确认整个 Discover Registry；现有统一 index/cache owner 拆分会产生混源和第二缓存边界。
- **Renderer 读取 JSON、环境变量或 descriptor。** 拒绝：破坏 Main 文件系统/选择边界。保留既有派生 homepage/HTTPS icon 展示不等于暴露 descriptor。
- **显式企业配置失败后回落公共 Registry。** 拒绝：会隐藏企业发行错误并产生不可审计的数据来源。

## Roadmap Boundaries

创建独立 `ROADMAP-WORK-v4.1.1-skill-registry-endpoint-configuration.md`，不追加或重开已全部 DONE 的 v4.0.1 Skill-First Roadmap。

| Suggested Item | Outcome | Depends On | Initial Status | Exit Criteria |
|---|---|---|---|---|
| RM-01 | Work Registry descriptor、source precedence 与 existing Registry owner 接入 | - | READY | default/runtime/build 矩阵通过；显式无效配置 fail closed；catalog/model/detail/tree/download 全链使用同一 descriptor；缓存按 identity 隔离；无 Renderer URL/新 IPC/Hermes Runtime 修改 |
| RM-02 | Enterprise build profile 与 packaged artifact verification | RM-01 | BACKLOG | 企业 profile 确定性生成完整 descriptor；installer/package 含正确 resource；Community build 保持公共默认；企业缺字段构建失败；产物无 secret |

RM-01 只交付运行时消费边界和 deterministic descriptor contract，不声称安装包已验证。RM-02 只接入 build profile、electron-builder resource 和包级证据，不改变 Registry runtime semantics。两项不得包含 Registry 审核/发布/签名、Hermes Agent/CLI 改造、认证协议或 Skill Run wire contract。
