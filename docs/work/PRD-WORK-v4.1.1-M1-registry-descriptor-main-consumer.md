---
work_item_id: RM-01
version: 1.0.2
status: APPROVED
target_branch: work/prd-v4.1
review_verdict: PASS
approved_at: 2026-09-10T10:30:13+08:00
source_revision: AD-WORK-v4.1.1-SKILL-REGISTRY-ENDPOINT-CONFIGURATION@1.0.1/RM-01
grounded_commit: 2afa1963934432cae28c1000e91a678d739c6a8d
---

# PRD-WORK-v4.1.1-M1 — Registry Descriptor & Main Consumer

本 Stage 将完整 Registry Endpoint Descriptor 接入现有 Work Main Registry owner，关闭公共默认、runtime 注入和 packaged build descriptor 的解析边界；企业 profile 与最终安装包证明留给 RM-02。

## Outcome

Work Main 在首次使用 Registry 前解析一个版本化、完整且已校验的 endpoint descriptor。整个 Discover Registry（skills、MCP、agents、workflows、models）的 catalog、详情、图标、homepage 和安装文件都来自同一 Registry identity；显式配置错误不会静默访问公共 Registry。

## Scope

### In

- 完整 `WorkRegistryEndpointDescriptor` 的公开配置合同、默认值、校验与 source metadata。
- `build > runtime > default` 的一次性来源解析语义，以及显式配置 fail-closed。
- 现有 Main Registry owner 对 catalog、models、detail、tree、download、homepage、icons 的统一 descriptor 消费。
- Registry cache 与 descriptor identity 绑定；测试/明确重新初始化时安全失效。
- 复用现有 `registry-*` IPC 返回 sanitized error code/message；Renderer 不接触 descriptor/base endpoint，但保留 Main 派生的 item homepage/HTTPS icon 展示字段。
- Main 结构化初始化日志与默认/runtime/build source 的确定性验证。
- 对应 LAT 架构与测试语义。

### Out

- 企业 build profile 文件、profile CLI、electron-builder resource 接线、Windows installer/package 检查；这些属于 RM-02。
- 企业 endpoint 的真实地址、认证 header/token、TLS/证书部署与 Git 服务商适配。
- Registry 内容审核、发布、签名、版本治理、安全扫描或 Marketplace 运营。
- Hermes Agent、Hermes CLI、Hermes Runtime Descriptor、Skill Run contract、Chat/Session/MCP/Profile/Cron/Kanban 行为变更。
- 新 Renderer 设置页、Registry 切换 UI 或新的配置 IPC channel。

## Descriptor Contract

一个 source 必须提供同一 schema version 下的完整 descriptor：

| Field | Required | Observable meaning |
|---|---|---|
| `schemaVersion` | yes | 当前阶段只接受已支持的 descriptor schema；未知版本 fail closed。 |
| `registryId` | yes | 稳定、非空的 source/cache identity；不得包含 secret。 |
| `indexUrl` | yes | 返回现有 Registry `index.json` catalog shape。 |
| `modelsUrl` | yes | 返回现有 model registry shape。 |
| `contentBaseUrl` | yes | 解析详情、manifest 与安装文件的 HTTP(S) base。 |
| `treeUrl` | yes | 返回可规范化为现有 recursive file entries 的受控列表响应。 |
| `webBaseUrl` | yes | 生成用户可打开的 registry item homepage。 |
| `iconBaseUrl` | no | 生成 item icon；若存在必须为 HTTPS；缺失时保持无图标，不访问其他 Registry。 |

除 `iconBaseUrl` 仅允许 `https:` 外，其余 URL 必须为绝对 `http:` 或 `https:` URL。所有 URL 不得带 username/password，不得使用 `file:`、`data:` 或相对路径。字段可以指向不同 origin，但它们必须作为一个原子 descriptor 被选择和记录，不能逐字段跨 source 合并。

`source` 是解析结果 metadata，取值为 `build | runtime | default`，不由配置输入伪造。Descriptor 不包含认证材料；需要认证协议时返回 Architecture，而不是在本 Stage 中加入 header/token。

Registry endpoint 的 wire/path contract 固定如下：

- `indexUrl` 返回现有 `{ "entries": [...] }` catalog contract；`modelsUrl` 返回现有 model registry contract。
- `treeUrl` 返回 `{ "tree": [{ "path": string, "type": "blob" | string }] }`；consumer 只使用 `type === "blob"` 的条目。该 endpoint 必须已经提供此 contract，Work 不根据 hostname 或 Git 服务商品牌转换 native API。
- `contentBaseUrl` 只与经过校验的 repo-relative POSIX path 组合。绝对路径、反斜杠、空 segment、`.`/`..` traversal、query 或 fragment path 输入均被拒绝，不能逃逸该 base。
- 响应 body、entry 数量、path 长度和下载内容均必须有确定性上限；超过上限按 unavailable/invalid response 处理，不把 raw body 返回 Renderer。

## Runtime Configuration Contract

Main-only runtime source 使用环境变量 `HERMES_SKILL_REGISTRY_CONFIG_FILE`，其值是包含完整 `WorkRegistryEndpointDescriptor` JSON 的绝对文件路径。

- 环境变量未定义时，runtime source 不存在，可以继续选择 default。
- 环境变量已定义但为空、不是绝对路径、文件不存在/不可读、JSON 非法或 descriptor 不完整时，runtime source 视为存在但无效，返回 `SKILL_REGISTRY_CONFIG_INVALID`。
- runtime 文件必须是完整 descriptor，不允许局部字段覆盖 build/default。
- 原输入中的单值 `HERMES_SKILL_REGISTRY_URL` 不在本合同中引入，也不能作为 partial override 被读取；完整 descriptor 已取代单 URL 方案。
- runtime 文件只由 Main 读取。路径、文件内容和 descriptor endpoint 不通过 preload/IPC 暴露。

## Source Resolution and Failure Semantics

Main 在一个进程生命周期内按以下顺序选择首个“存在”的完整 source：

```text
packaged build descriptor
  > explicit Main-only runtime descriptor
  > public default descriptor
```

- “不存在”才允许继续到下一 source。
- “存在但无法读取、解析或校验”返回 `SKILL_REGISTRY_CONFIG_INVALID`，不得继续到下一 source。
- descriptor 已通过校验但 Registry 请求不可达、响应非成功或不满足公开 response shape，返回 `SKILL_REGISTRY_UNAVAILABLE`，不得切换 source。
- 返回 Renderer 的 message 固定、sanitized，不包含 response body、绝对本地路径、query、userinfo、token 或内部异常堆栈。
- 初始化日志记录事件、`source`、`registryId` 和无敏感信息的 endpoint origin；不得记录完整 query、userinfo 或响应体。

RM-01 只建立 packaged build descriptor 的消费 seam 和确定性 fixture，不生成企业 profile 或宣称安装包已携带该 resource。

## Current Capability Inventory

| Capability | State | Production Owner | Grounding |
|---|---|---|---|
| Unified catalog/model/detail/download client | EXISTS | Existing Work Main Registry owner | `apps/work/src/main/registry.ts` owns fetch, normalize, cache, detail and install flows. |
| Registry IPC/preload boundary | EXISTS | Existing Main IPC + preload Registry surface | Existing `registry-*` calls expose catalog/actions without Renderer network access. |
| Discover/Tools Registry presentation | EXISTS | Existing Renderer screens | Discover consumes full catalog; Tools reuses MCP icons. |
| Public GitHub endpoint constants | EXISTS, INSUFFICIENT | Existing Main Registry owner | URL construction is fixed to GitHub raw/tree/web/icon services. |
| Registry endpoint descriptor | MISSING | Extend existing Main Registry configuration boundary | No versioned complete descriptor or source metadata exists. |
| Source precedence/fail-closed initialization | MISSING | Extend existing Main Registry owner | Registry functions currently close over module constants. |
| Identity-bound Registry caches | PARTIAL | Existing Main Registry owner | Catalog/model/tree caches exist but are not keyed by Registry identity. |
| Build resource consumption pattern | EXISTS | Existing Work build/runtime read boundary | Build identity already demonstrates packaged resource loading; Registry-specific generation is RM-02. |
| Hermes Runtime Descriptor | EXISTS, KEEP | Managed Runtime config owner | Owns Hermes home/CLI/Gateway only and must not absorb Registry fields. |

## Target End-State Inventory

| Capability | Target State | Production Owner | Boundary |
|---|---|---|---|
| Descriptor contract/default/validation | ADD | Existing Main Registry configuration boundary | Pure validated input; no network or install ownership. |
| Source resolution | ADD | Existing Main Registry owner | Resolve once as build/runtime/default; selected invalid source fails closed. |
| Catalog/model/detail/install transport | MODIFY | Existing `registry.ts` owner | Every URL derives from one validated descriptor. |
| Registry caches | MODIFY | Existing `registry.ts` owner | Cache entries are scoped to `registryId`; no cross-source reuse. |
| Registry result errors | MODIFY | Existing Registry IPC DTO | Stable sanitized code/message on the same IPC surface. |
| Renderer Registry UI | KEEP | Existing Discover/Tools owners | No descriptor/base endpoint knowledge, filesystem read or new settings; existing derived homepage/HTTPS icon presentation remains. |
| Build descriptor generation/package proof | KEEP for RM-01 | Existing build pipeline | Deferred to RM-02; RM-01 supplies only consumer seam/contract. |
| Hermes Runtime/Agent/CLI/Skill Run | KEEP | Existing owners | No contract, lifecycle or endpoint ownership changes. |

## Change Classification

| Change ID | Classification | Capability | Required change | Production Owner |
|---|---|---|---|---|
| C01 | ADD | Complete Registry Descriptor contract | Add versioned fields, public default, validation, source metadata and bounded sanitized config errors. | Existing Main Registry configuration boundary |
| C02 | ADD | Source resolution | Resolve build/runtime/default atomically with build precedence and fail-closed selected-source semantics. | Existing Main Registry owner |
| C03 | MODIFY | Registry network/detail/install flow | Replace module-constant URL construction with the selected descriptor across every catalog and content operation. | Existing Main Registry owner |
| C04 | MODIFY | Registry caches | Bind catalog/model/tree cache reuse and invalidation to descriptor identity. | Existing Main Registry owner |
| C05 | MODIFY | Existing Registry result boundary and observability | Return stable sanitized error codes on existing IPC results and emit source/identity initialization telemetry without secrets; preserve derived homepage/HTTPS icon DTO fields without exposing descriptor/base endpoints. | Existing Main Registry IPC/observability owners |
| C06 | KEEP | Renderer, Hermes Runtime, Agent/CLI, Skill Run and unrelated Work domains | Preserve existing owners and regressions; no new configuration IPC or Renderer URL. | Existing owners |
| C07 | MODIFY | Work LAT | Record descriptor ownership, source precedence, fail-closed behavior, cache identity and RM-02 boundary. | Work LAT |

No capability is REPLACE or REMOVE. `registry.ts` remains the single Registry production owner; URL constants are implementation details to be replaced inside that owner, not a second owner removal.

## Behaviour Requirements

### Default source

When neither build nor runtime descriptor exists, Work uses one public default descriptor that preserves the current public catalog/model/detail/install behavior. Default icon absence or per-item missing icon renders without an icon and never switches icon source.

### Runtime source

In an unpackaged/development environment with no build descriptor, `HERMES_SKILL_REGISTRY_CONFIG_FILE` 指向的完整 runtime descriptor becomes the selected source. It must pass the same schema and URL validation as build input. Unset means absent; set-but-empty/unreadable/invalid means selected-source failure. Partial per-field overrides and `HERMES_SKILL_REGISTRY_URL` are forbidden because they create mixed Registry identity.

### Build source

When a valid packaged descriptor exists, it wins even if a runtime descriptor is present. RM-01 proves this through the consumer seam and deterministic fixtures; RM-02 owns generation, profile selection and final package inspection.

### Unified Registry access

After selection, index, models, detail docs, manifests, recursive file listing, downloads, homepage and icons all use the selected descriptor. Enterprise-mode tests must fail if any operation contacts the public default endpoints.

### Cache and lifecycle

Catalog, model and tree caches may be reused only for the same `registryId` and equivalent normalized descriptor. Explicit test/runtime reinitialization clears all three as one unit. Ordinary tab navigation retains existing cache efficiency.

### Errors and logging

Invalid selected configuration and unavailable selected Registry remain distinguishable through stable codes. Renderer receives only sanitized messages. Main emits one initialization record per resolved lifecycle containing source and identity; repeated page loads do not log a new source decision.

## Acceptance Criteria

- **AC-01**: Public default — With no build/runtime source, the resolver selects `default`; catalog, models, detail and install transport use the public complete descriptor and existing normalized DTO shapes remain compatible.
- **AC-02**: Atomic precedence — Valid build + valid `HERMES_SKILL_REGISTRY_CONFIG_FILE` selects build; absent build + valid runtime file selects runtime; both absent selects default. No descriptor is assembled by merging fields from different sources, and `HERMES_SKILL_REGISTRY_URL` is never read.
- **AC-03**: Invalid selected source — Present but empty/unreadable/malformed, unsupported-version, partial, non-HTTP(S), relative or userinfo-bearing build/runtime input returns `SKILL_REGISTRY_CONFIG_INVALID` and performs zero Registry network requests and zero fallback requests. A set runtime path must be absolute and point to a readable regular JSON file.
- **AC-04**: Unified source — For each source, catalog, models, detail, manifest, tree, download, homepage and optional icon derive from the same selected descriptor. Tree accepts only the frozen `{tree:[{path,type}]}` contract; content paths cannot escape `contentBaseUrl`; `iconBaseUrl` accepts HTTPS only, and its absence produces no icon/public icon request; no hostname/provider-specific adapter is used.
- **AC-05**: Unavailable source — A validated selected Registry that returns network, status or response-shape failure produces `SKILL_REGISTRY_UNAVAILABLE`; it does not access a lower-priority source and does not expose raw response/body/path/credentials.
- **AC-06**: Cache isolation — Catalog/model/tree data from one descriptor identity is never returned after initialization with a different identity; same-identity navigation retains cache behavior.
- **AC-07**: Existing boundary — Renderer cannot provide/read the Registry descriptor or base endpoint configuration and no new configuration IPC exists. Existing Registry IPC remains the only UI bridge; compatible catalog/action DTO may retain Main-derived item homepage/HTTPS icon plus sanitized error code/message.
- **AC-08**: Observability — Initialization records exactly one source decision with `source` and `registryId`; logs and returned errors contain no token, userinfo, query, response body, absolute local path or stack.
- **AC-09**: Ownership/regression — Hermes Runtime descriptor, Hermes Agent/CLI, Skill Run, Chat, Session, MCP, Profile, Cron and Kanban contracts remain unchanged; Renderer CSP is not broadened; Work guard and package-wide Node/Web typecheck pass.
- **AC-10**: RM-02 boundary — RM-01 does not add enterprise profile values, profile CLI, electron-builder resource generation or installer claims. The consumer seam accepts deterministic build fixtures so RM-02 can connect packaging without changing runtime semantics.
- **AC-11**: LAT — Work LAT documents complete descriptor ownership, source precedence, selected-source fail-closed behavior, identity-bound cache and the RM-02 packaging boundary; `lat check` passes.

## Evidence Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason |
|---|---|---|---|---|---|---|---|
| CL-01 | AC-01 | No-config startup preserves the public Registry behavior | yes | Current fixed public Registry client | PROVEN_BUT_AFFECTED | TARGETED_RERUN | C01/C03 replace endpoint construction. |
| CL-02 | AC-02 | Build/runtime/default resolution is atomic and ordered; runtime ingress is the complete descriptor file contract | yes | No existing resolver | NOT_TESTED | NEW_EVIDENCE | New capability and external configuration contract. |
| CL-03 | AC-03 | Invalid selected source/file fails before network and never falls back | yes | No descriptor validation | NOT_TESTED | NEW_EVIDENCE | New trust boundary. |
| CL-04 | AC-04 | Every Registry operation uses one descriptor and one provider-neutral tree/content contract | yes | Current operations share GitHub constants/shape | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Constants become injected endpoint fields and path inputs gain validation. |
| CL-05 | AC-05 | Unavailable selected Registry returns sanitized stable error without fallback | yes | Existing catalog returns free-form error and empty data | FAILED | NEW_EVIDENCE | Stable code and no-fallback semantics are absent. |
| CL-06 | AC-06 | Registry cache never crosses descriptor identity | yes | Existing unkeyed module caches | FAILED | NEW_EVIDENCE | Identity isolation is absent. |
| CL-07 | AC-07 | Renderer boundary stays endpoint-free on existing IPC | yes | Existing Main IPC/preload/Renderer call chain | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Existing result DTO gains sanitized error code. |
| CL-08 | AC-08 | Source is observable without secret/URL leakage | yes | No Registry initialization event | NOT_TESTED | NEW_EVIDENCE | New observability contract. |
| CL-09 | AC-09 | Unrelated owners and package-wide contracts remain green | yes | RM-18 typecheck evidence at current grounded commit | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Shared Main/IPC/Registry code changes require fresh proof. |
| CL-10 | AC-10 | RM-01 contains no enterprise packaging/profile implementation | yes | Architecture Roadmap boundary | PROVEN_FRESH | REUSE_EVIDENCE | Boundary is unchanged from approved AD. |
| CL-11 | AC-11 | LAT reflects the delivered architecture and validates | yes | No v4.1.1 Registry descriptor node | NOT_TESTED | NEW_EVIDENCE | New architecture documentation. |

## Source Anchors

| Capability | Evidence anchor |
|---|---|
| Existing Registry owner and GitHub specialization | `apps/work/src/main/registry.ts` |
| Existing Registry IPC | `apps/work/src/main/ipc/register.ts` Registry handlers |
| Existing preload boundary | `apps/work/src/preload/index.ts` Registry methods |
| Existing Renderer consumers and HTTPS icon exception | `apps/work/src/renderer/src/screens/Discover/Discover.tsx`; `apps/work/src/renderer/src/screens/Tools/Tools.tsx`; `apps/work/src/main/app/start.ts` CSP |
| Existing build resource pattern | `apps/work/scripts/generate-work-build-info.mjs`; `apps/work/electron-builder.yml` |
| Managed Runtime boundary | `apps/work/src/main/runtime/hermes-runtime-config.ts`; `apps/work/lat.md/runtime-connection.md` |
| Approved parent decision | `docs/work/AD-WORK-v4.1.1-skill-registry-endpoint-configuration.md` |
| Roadmap item | `docs/work/ROADMAP-WORK-v4.1.1-skill-registry-endpoint-configuration.md` RM-01 |

## Definition of Done

- **DOD-01**: C01–C07 are delivered by one canonical RM-01 Plan derived from this APPROVED PRD; RM-02 packaging/profile work is absent.
- **DOD-02**: CL-01–CL-11 have fresh blocking evidence or explicitly valid reused evidence; no current FAIL/NOT_TESTED claim is treated as complete.
- **DOD-03**: Completion Audit, independent Implementation Review, all blocking verification and durable evidence manifest pass before implementation commit.
- **DOD-04**: Roadmap RM-01 moves to DONE only with the real implementation commit and parseable evidence reference; RM-02 becomes READY only after that separate status update.
- **DOD-05**: Any need for Git-host inference, credentials/auth headers, Renderer descriptor/base endpoint selection, HTTP icon/CSP broadening, Main icon proxy, Hermes Runtime descriptor mutation or provider-specific adapter returns to Architecture instead of expanding the Plan.
