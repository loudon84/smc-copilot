---
name: Work v2.0 Updater Core
overview: 将 apps/work 的桌面更新收敛为 Main Snapshot + revision 单一状态源，并固定“自动检查、用户确认下载、用户确认安装”；本切片不改应用身份、安装范围、生产 feed、签名或发布。
todos:
  - id: shared-preload-contract
    content: 新增 AppUpdateState v2 与 namespaced preload IPC，在迁移期保留最小旧调用兼容
    status: completed
  - id: main-updater-state
    content: 在 setupUpdater 根路径实现 Snapshot/revision、手工下载与安装、静默后台检查和可测试调度
    status: completed
  - id: renderer-provider
    content: 挂载全局 AppUpdateProvider，并用 revision 消除订阅/快照竞态
    status: completed
  - id: renderer-consumers
    content: 将 Layout 与 Settings/About 迁移到 useAppUpdate，并删除局部状态、旧 listener 和 auto-upgrade preference
    status: completed
isProject: false
---

# Cursor Implementation Plan — Work v2.0 Updater Core

## 结果与边界

要实现：

- packaged Windows 自动检查更新，但下载和安装都必须由用户分别触发。
- Main Process 持有带 `revision` 的完整 Snapshot，Layout 与 About 展示同一状态。

明确不做：

- 不修改 `appId`、productName、per-machine、安装目录、Generic Provider URL 或 portable target。

## 上下文路由

立即读取：

- [`AGENTS.md`](../../AGENTS.md)：仅确定项目路由。
- [`apps/work/AGENTS.md`](../../apps/work/AGENTS.md)：执行 lat search、知识同步和 post-task 检查。
- [`docs/work/PRD-WORK-v2.0-windows-release-auto-update-implementation.md`](../../docs/work/PRD-WORK-v2.0-windows-release-auto-update-implementation.md)：本切片边界与验收。
- [`apps/work/src/main/app/updater.ts`](../../apps/work/src/main/app/updater.ts)：`setupUpdater` 共享根因锚点。

按触发读取：

- 修改 IPC/event 时读取 [`docs/architecture/contract-flow.md`](../../docs/architecture/contract-flow.md)；只有发现跨项目公共契约缺口才加载对应 `contracts/` schema 与生成入口。

禁止预加载：

- 历史 PRD/evidence、无关 ADR/子项目、整个目录、references、构建产物、运行时数据和归档内容。

## 最小方案判定

- 复用：现有 `setupUpdater`、`electron-updater`、`updaterLogger`、React Context 和 preload cleanup 模式。
- 最小方案：搜索 `setupUpdater` 与旧 preload 方法的直接调用方，在现有 bootstrap 建立 Snapshot，不增加第二个 updater bootstrap、store 或后台进程。
- 所有“候选触碰”均为探索上限；触及应用身份或 `userData` 时立即停止。

## Todo — Shared / Preload Contract

### 结果

- 新增共享 `AppUpdateState`、结构化错误与 channel 常量；preload 暴露 get/check/download/install/stateChanged v2。

### 实施锚点

- 主锚点：[`apps/work/src/shared/app-update.ts`](../../apps/work/src/shared/app-update.ts) 的 `AppUpdateState`。
- 候选触碰：[`apps/work/src/preload/index.ts`](../../apps/work/src/preload/index.ts)、[`apps/work/src/preload/index.d.ts`](../../apps/work/src/preload/index.d.ts)。

### 变更预算

- 新增生产文件/共享 IPC contract：各 1；新增依赖/抽象层/测试文件：0；共享 contract 是禁止重复状态类型所必需。

### 最小验证

- 命令：`cd apps/work && npm test -- --run tests/preload-api-surface.test.ts && npm run typecheck:node`

### 停止条件

- [ ] v2 preload 方法与声明一致，回调返回 cleanup，Renderer 不能传 feed URL 或文件路径。
- [ ] 旧方法仅作为本计划内迁移兼容，未新增第二套状态类型。

## Todo — Main Updater State

### 结果

- Main 产生单调 revision Snapshot；`autoDownload` 和 `autoInstallOnAppQuit` 固定为 false；后台失败静默且不覆盖可操作状态。

### 实施锚点

- 主锚点：[`apps/work/src/main/app/updater.ts`](../../apps/work/src/main/app/updater.ts) 的 `setupUpdater`。
- 候选触碰：[`apps/work/src/shared/app-update.ts`](../../apps/work/src/shared/app-update.ts)、[`apps/work/src/main/app/updater.test.ts`](../../apps/work/src/main/app/updater.test.ts)。

### 变更预算

- 新增生产文件/依赖/公共抽象层：0；候选修改文件：最多 2；新增测试文件：1。
- 新测试文件用于隔离 Electron Updater 事件、timer 与 packaged/platform 边界，现有测试无可复用锚点。

### 最小验证

- 先加入会失败的断言：事件映射、旧 revision 拒绝、later 后普通退出不安装、background check error 保留 ready、dev/non-Windows no-network。
- 命令：`cd apps/work && npm test -- --run src/main/app/updater.test.ts && npm run typecheck:node`

### 停止条件

- [ ] Snapshot、合法操作和 scheduler 满足 PRD Phase 1，重复 check/download 不产生并发副作用。
- [ ] `autoDownload=false`、`autoInstallOnAppQuit=false`，只有 ready + 用户 install 才调用 `quitAndInstall`。

## Todo — Global Renderer Provider

### 结果

- Provider 在 Settings/Screen 生命周期外全局挂载，先订阅再取 Snapshot，并只接受更高 revision。

### 实施锚点

- 主锚点：[`apps/work/src/renderer/src/update/AppUpdateProvider.tsx`](../../apps/work/src/renderer/src/update/AppUpdateProvider.tsx) 的 `AppUpdateProvider`。
- 候选触碰：[`apps/work/src/renderer/src/App.tsx`](../../apps/work/src/renderer/src/App.tsx)、[`apps/work/src/renderer/src/update/AppUpdateProvider.test.tsx`](../../apps/work/src/renderer/src/update/AppUpdateProvider.test.tsx)。

### 变更预算

- 新增生产文件：1；新增内部 Context/hook：1；新增测试文件：1；新增依赖/公共接口：0。
- Provider 是跨 Screen 持久状态与竞态恢复的最小新增边界；不拆分额外组件文件。

### 最小验证

- 先加入会失败的断言：事件早于 Snapshot、Snapshot 早于事件、旧 revision、unmount cleanup。
- 命令：`cd apps/work && npm test -- --run src/renderer/src/update/AppUpdateProvider.test.tsx && npm run typecheck:web`

### 停止条件

- [ ] Provider 不依赖 Settings 是否打开，且不会用旧 Snapshot 覆盖新事件。
- [ ] action 只调用 preload v2，不自行推导版本或完成状态。

## Todo — Renderer Consumer Migration

### 结果

- Layout 与 About 使用同一 `useAppUpdate()`；删除 `useSettingsData` 的 updater state/listeners/preference，最终移除旧 preload updater 方法。

### 实施锚点

- 主锚点：[`apps/work/src/renderer/src/components/settings/useSettingsData.ts`](../../apps/work/src/renderer/src/components/settings/useSettingsData.ts) 的 `useSettingsData`。
- 候选触碰：[`apps/work/src/renderer/src/screens/Layout/Layout.tsx`](../../apps/work/src/renderer/src/screens/Layout/Layout.tsx)、[`apps/work/src/renderer/src/components/settings/AboutPane.tsx`](../../apps/work/src/renderer/src/components/settings/AboutPane.tsx)。

### 变更预算

- 新增生产文件/依赖/公共接口/抽象层/测试文件：0；候选修改文件：最多 3。

### 最小验证

- 命令：`cd apps/work && npm test -- --run tests/preload-api-surface.test.ts && npm run typecheck && npm run guard && lat check`

### 停止条件

- [ ] 搜索不到旧 auto-upgrade preference 与四类离散 updater listener 的生产调用方。
- [ ] Layout、About 来自同一 revision，Hermes Agent Update 独立，并已更新 `lat.md/desktop-updates.md`。

## 跳过 / 何时再加

- 身份/NSIS/Generic Provider 在 IDM-01 与 CUTOVER-01 签署后另建 packaging plan。
- 签名、原子发布、Bridge、真实旧版到新版升级和 Live Evidence 另建 manual release plan；Cursor 不得自动完成。
