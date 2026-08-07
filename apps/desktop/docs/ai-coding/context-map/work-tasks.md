# Context Map — Work 任务窗口（v1.4）

## 职责

Local Hermes 内 **Tasks** 导航：三栏任务窗口、SSE 事件流、右栏 Inspector。

## 路径

| 层 | 路径 |
|----|------|
| 页面 | `src/renderer/src/screens/Hermes/pages/Tasks/` |
| Store | `features/task-store/` |
| API | `api/workTaskApi.ts` |
| Main | `src/main/work/` |
| Preload | `window.work` |
| 契约 | `src/shared/work/` |

## IPC

- `work:task-send` / `work:task-stop` / `work:task-event`
- 详见 `docs/API_CONTRACTS.md` § Work

## 与 copilot-serve 边界

- `window.copilotServe`：进程生命周期 only
- 任务业务走 `work` IPC，**不**经 workspaceChat

## Mock 模式

`VITE_WORK_MOCK_MODE` — 销售作战 mock 流（开发）

## 事件块

11 种 stream block 类型（见 `prd_work/v1.4_work-agent-event-stream.md`）

## UI 结构

```text
TaskWindow（三栏）
  ├─ 左：任务列表 / 上下文
  ├─ 中：事件流 Timeline
  └─ 右：五 Tab Inspector
```

## 延伸阅读

- `prd_work/v1.4_work-agent-event-stream.md`
- `.cursor/plans/v1.4_work_任务窗口_*.plan.md`
- `context-map/hermes-workbench.md`

## 分层

页面 → `workTaskApi` → `window.work`；组件不直接 IPC。
