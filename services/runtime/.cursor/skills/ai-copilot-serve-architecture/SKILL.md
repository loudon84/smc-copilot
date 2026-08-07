---
name: smc-copilot-serve-architecture
description: Use when designing, refactoring, or reviewing smc-copilot-serve architecture, module boundaries, service layout, API contracts, or database model placement for the local Hermes control plane.
license: Proprietary
compatibility: Designed for Cursor Agent, Python 3.12, FastAPI, SQLAlchemy, SQLite, Hermes Gateway integration.
metadata:
  version: "1.1"
  owner: "smc-copilot-desktop"
---

# smc-copilot-serve Architecture Skill

## When to activate

Use this skill when the user asks for architecture, project structure, module design, API layout, refactor strategy, or implementation planning for `smc-copilot-serve`.

## System boundary

`smc-copilot-serve` is the local service layer for `smc-copilot-desktop`.

It must coordinate:

- HermesLocalService local control plane
- multiple Hermes Gateway profiles
- Profile Runtime
- Gateway Supervisor
- Team Task Runtime
- Approval Runtime
- Workspace Guard
- Audit Log
- Windows service packaging

## Architecture rules

1. Keep the service local-first. Use SQLite first. Do not introduce Postgres, Redis, MQ, or Kubernetes unless the task explicitly requires it.
2. Treat Hermes Gateway as an external runtime. Never embed Hermes internals directly into API routers.
3. Keep process management under `runtime/` and `services/gateway_supervisor.py`.
4. Keep remote collaboration under `integrations/team_hub/` and `services/task_runtime.py`.
5. Keep risky local operations behind `services/workspace_guard.py` and `services/approval_service.py`.
6. Every new runtime state must be persisted if the desktop must recover after restart.
7. Every background loop must be cancellable and lifecycle-managed.

## Preferred module mapping

源码根为扁平 `src/`（`dev-mode-dirs` / `PYTHONPATH` 指向 `src`，不再使用 `src/copilot_serve/` 包前缀）。路径均相对于 `src/`。

```text
src/                                    # 扁平源码根
  main.py                               # CLI / Uvicorn 入口
  app.py                                # FastAPI 应用工厂
  version.py
  core/                                 # 配置、生命周期、日志、错误、路由常量
  api/
    deps.py
    router.py
    middleware/                         # CORS、鉴权等 ASGI 中间件
    v1/                                 # FastAPI 路由（薄壳）
  schemas/                              # Pydantic DTOs
  db/
    base.py
    session.py
    models/                             # SQLAlchemy models
    repositories/                       # DB access only
  services/                             # 业务编排（gateway_supervisor、task_runtime 等）
  integrations/
    hermes/                             # Gateway HTTP、配置、Profile 加载
    team_hub/                           # 远程 Team Task Hub 客户端
    local_shell/                        # （规划中）命令执行适配器
  runtime/                              # 进程注册、端口分配、Gateway 子进程
  workers/                              # 可取消的后台循环
  local_service/                        # Windows 服务打包、CLI、runner
  utils/                                # 路径等无业务副作用工具
```

## Design output format

When producing architecture output, always include:

1. Target module
2. Responsibility
3. Files to create or modify
4. API contract impact
5. DB migration impact
6. Test plan
7. Windows compatibility impact
8. Security impact

## Rejection criteria

Reject or redesign plans that:

- put Hermes Gateway process control inside Electron Renderer
- let React UI execute shell commands
- bypass approval for dangerous operations
- hardcode profile ports without collision checks
- mix database logic into routers
- store secrets in SQLite without encryption or redaction strategy
