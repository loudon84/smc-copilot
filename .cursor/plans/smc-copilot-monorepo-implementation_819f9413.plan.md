---
name: smc-copilot-monorepo-implementation
overview: 按 PRD v1.0 将 ai-os-desktop 与 ai-os-serve 通过 git subtree（保留历史）导入 e:\git\smc-copilot Monorepo，分 8 个阶段完成 Nx 编排、契约生成、TS Client、CI/Release 与 Cursor 上下文治理，每阶段独立 commit。
todos:
  - id: phase-0
    content: Phase 0：记录来源 SHA、暂存 clone、git init 与迁移分支
    status: completed
  - id: phase-1
    content: Phase 1：subtree 导入 desktop/runtime、回迁产物、验证历史
    status: completed
  - id: phase-2
    content: Phase 2：Desktop 与 Runtime 独立构建/测试恢复
    status: completed
  - id: phase-3
    content: Phase 3：根 package.json、nx.json、四个 project.json 与 affected 验收
    status: completed
  - id: phase-4
    content: Phase 4：OpenAPI/事件 Schema 导出、version.json、漂移与 breaking 检查
    status: completed
  - id: phase-5
    content: Phase 5：runtime-client-ts 生成 + facade + Desktop Main 最小接入
    status: completed
  - id: phase-6
    content: Phase 6：CI workflows、CODEOWNERS、Release Manifest 工具
    status: completed
  - id: phase-7
    content: Phase 7：AGENTS/Rules/cursorignore 治理与架构文档、ADR
    status: completed
isProject: false
---

# SMC Copilot Monorepo 实施计划（PRD v1.0）

## 现状

- `e:\git\smc-copilot` 不是 git 仓库；含 `apps\desktop`（ai-os-desktop @ `5bd9e02` main）与 `services\runtime`（ai-os-serve @ `e95b1a9` master）两个独立 clone（嵌套 `.git`，不符合 PRD §7）
- Desktop 已装 `node_modules`、有 `.env`、`out/`；Runtime 已建 `.venv`、`data/`、`dist/`；均保留并回迁
- Desktop 有一个无 `.gitmodules` 的 gitlink `references/copilot-desktop`（subtree 后保留为 gitlink，内容回迁）
- Desktop 已有 `scripts/serve-client/`（snapshot + openapi-typescript），Phase 5 将切换为消费 Monorepo 契约
- Runtime `src/app.py` 提供 `create_app()`（PRD §5.5 要求的导出入口）；SSE 出口在 `src/api/v1/runtime.py`、`chat.py`、`work_tasks.py`、`instance_chat.py`
- 工具链就绪：Node 24 / npm 11 / git 2.54 / uv 0.11.29 / Python 3.12.10

## 执行约束（PRD §20）

- 按阶段实施，每阶段独立 commit（使用 PRD 建议的 commit message）
- 测试不通过不进入下一阶段
- 仅本地仓库，不推送远端

## Phase 0：冻结与初始化

- 记录来源 SHA（desktop `5bd9e02` / runtime `e95b1a9`）写入 [docs/architecture/source-imports.json](docs/architecture/source-imports.json)
- 将两个 clone 移到暂存区 `e:\git\_smc-import\desktop-src`、`e:\git\_smc-import\runtime-src`（连带 node_modules/.venv/.env 等产物）
- `git init -b main` → README 初始 commit → 建分支 `feature/monorepo-bootstrap`
- 新建根 `.gitignore`（node_modules、.venv、dist、out、data、.env、.nx 等）

Commit: `chore: initialize smc-copilot monorepo`

## Phase 1：subtree 源码导入

- `git subtree add --prefix=apps/desktop e:\git\_smc-import\desktop-src main`（不加 `--squash`）
- `git subtree add --prefix=services/runtime e:\git\_smc-import\runtime-src master`
- 从暂存目录回迁产物：`node_modules`、`.env`、`out` → apps/desktop；`.venv`、`data`、`dist` → services/runtime；`references/copilot-desktop` 内容回迁
- 删除暂存目录；验证无嵌套 `.git`、`git log -- apps/desktop` / `git log -- services/runtime` 有完整历史

Commit: `chore(monorepo): import desktop source history` + `chore(monorepo): import runtime source history`

## Phase 2：独立构建恢复

- Desktop：`npm run lint` / `typecheck` / `test` / `build`（node_modules 已回迁；失败则 `npm ci`）
- Runtime：`uv sync --extra dev` → `alembic upgrade head` → `ruff check .` → `pytest` → `uv build`
- 修复目录迁移导致的硬编码路径（预期极少；已确认 build 脚本无 `git rev-parse --show-toplevel` 依赖）

Commit: `build(desktop): restore nested desktop build` + `build(runtime): restore nested runtime build`

## Phase 3：Nx 接入

- 根 [package.json](package.json)：仅 `nx` + `@nx/workspace` 锁定同版本，脚本按 PRD §8.3
- [nx.json](nx.json)：namedInputs/targetDefaults 按 PRD §8.4
- 四个 project.json：
  - [apps/desktop/project.json](apps/desktop/project.json)：install/dev/lint/typecheck/test/test-e2e/build/package-win|mac|linux，全部 `cwd: apps/desktop`
  - [services/runtime/project.json](services/runtime/project.json)：install/dev/migrate/lint/format-check/test/build/smoke/package-windows，全部 `cwd: services/runtime`
  - [contracts/project.json](contracts/project.json)：generate / check target
  - [packages/runtime-client-ts/project.json](packages/runtime-client-ts/project.json)：generate / typecheck target
  - 依赖方向：contracts→runtime、runtime-client-ts→contracts、desktop→runtime-client-ts（implicitDependencies）
- 验收：`npx nx show projects`、`nx run desktop:build`、`nx run runtime:test`

Commit: `build(nx): add project graph and targets`

## Phase 4：契约生成

- [tools/contract-generate/export_openapi.py](tools/contract-generate/export_openapi.py)：sys.path 注入 `services/runtime/src` → `create_app().openapi()` → 键排序规范化 → [contracts/runtime-api/openapi.yaml](contracts/runtime-api/openapi.yaml)（无时间戳/绝对路径，重复生成字节一致）
- [tools/contract-generate/export_event_schemas.py](tools/contract-generate/export_event_schemas.py)：从 Runtime Pydantic 模型导出 Job/Chat/Error 事件 Schema → `contracts/runtime-events/*.schema.json`（error envelope 与 `src/api/middleware/error_envelope.py` 对齐）
- [tools/contract-generate/check_contract_drift.py](tools/contract-generate/check_contract_drift.py)：临时重生成与已提交文件比对，漂移退出码 1 + PRD §12.3 提示文案
- [contracts/version.json](contracts/version.json)：按 PRD §14 示例初始化（runtimeApi `1.3.0`、runtimeEvents `1.0.0`、minimumDesktop `0.1.9`、minimumRuntime `1.6.0`）
- 简单 breaking-change 检查（对比 git HEAD 中的 openapi.yaml：endpoint/method/字段/enum 变化）

Commit: `feat(contracts): generate runtime OpenAPI and event schemas`

## Phase 5：TypeScript Client

- 新建 [packages/runtime-client-ts](packages/runtime-client-ts)：`src/generated/`（[tools/contract-generate/generate_ts_client.mjs](tools/contract-generate/generate_ts_client.mjs) 用 openapi-typescript 从 contracts/openapi.yaml 生成）+ 手写 facade：`client/create-runtime-client.ts`、`auth-provider.ts`、`error-normalizer.ts`、`sse-client.ts`、`index.ts`
- Desktop 接入：[apps/desktop/tsconfig.node.json](apps/desktop/tsconfig.node.json) 增加 paths `@smc/runtime-client`；[apps/desktop/electron.vite.config.ts](apps/desktop/electron.vite.config.ts) 仅 main 块加 alias
- Main Process 最小接入一个 Runtime API（如 runtime/status），删除对应手写 DTO；保留 `src/shared/copilot-serve/copilot-serve-contract.ts`（进程控制契约）与现有 serve-client 管线（PRD §22.2 回滚兼容）
- 验收：client 独立 typecheck、desktop build 通过、generated 可完全重生成

Commit: `feat(runtime-client): generate TypeScript runtime client`

## Phase 6：CI 与 Release

- [.github/workflows](.github/workflows)：`desktop-ci.yml`、`runtime-ci.yml`、`contracts-ci.yml`、`integration-ci.yml`、`release.yml`（按 PRD §17 触发路径与步骤；PR 默认 `nx affected`）
- [.github/CODEOWNERS](.github/CODEOWNERS)
- [tools/release/build-release-manifest.mjs](tools/release/build-release-manifest.mjs)（输出 PRD §18.3 兼容矩阵）、[tools/release/verify-version-bumps.mjs](tools/release/verify-version-bumps.mjs)
- 本地无法跑 GitHub Actions，以 YAML 静态校验 + 各命令本地等效执行代替

Commit: `ci(monorepo): add affected project pipelines`

## Phase 7：Cursor 上下文治理 + 文档

- 根 [AGENTS.md](AGENTS.md)（仅路由，PRD §15.1）；更新 [apps/desktop/AGENTS.md](apps/desktop/AGENTS.md)、[services/runtime/AGENTS.md](services/runtime/AGENTS.md) 中旧仓库根路径为子目录路径
- 根 `.cursor/rules/`：`repository-routing.mdc`、`desktop-boundary.mdc`、`runtime-boundary.mdc`、`contract-boundary.mdc`（glob 与规则按 PRD §15.4）
- [.cursorignore](.cursorignore)、[.cursorindexingignore](.cursorindexingignore) 按 PRD §15.6/§15.7
- [tools/agent-context/verify-rules.mjs](tools/agent-context/verify-rules.mjs)、[generate-project-map.mjs](tools/agent-context/generate-project-map.mjs)
- 文档：[docs/architecture/monorepo.md](docs/architecture/monorepo.md)、[desktop-runtime-boundary.md](docs/architecture/desktop-runtime-boundary.md)、[contract-flow.md](docs/architecture/contract-flow.md)、[docs/adr/ADR-001~005](docs/adr)、[docs/INDEX.md](docs/INDEX.md)
- 根 [README.md](README.md) 完善

Commit: `docs(monorepo): add architecture and agent routing`

## 主要风险

- subtree add 的 gitlink（references/copilot-desktop）：保留 gitlink 条目，内容从暂存目录回迁
- Desktop e2e（Playwright/Electron）在无显示环境下可能失败，阶段门禁采用 lint/typecheck/test/build
- Phase 5 生成 Client 接入若不稳定，按 PRD §22.2 回退（保留契约生成，Desktop 暂用原手写 client）
- pytest / electron-builder 耗时较长，按需后台执行