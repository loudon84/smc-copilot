# Hermes Gateway 进程管理

> copilot-serve 本地控制面中，多 Profile Hermes Gateway 的**子进程生命周期**说明。  
> 改 `gateway_process.py` / `gateway_supervisor.py` 前建议先读本文。

---

## 1. 架构分层

```text
API (profiles / gateways)
        │
        ▼
GatewaySupervisor          ← 状态机、DB 同步、健康检查、审计
        │
        ▼
GatewayProcessManager      ← asyncio 子进程启停、日志重定向、端口孤儿清理
        │
        ▼
Hermes CLI (外部)          ← `hermes gateway --port … --profile …`
        │
        ▼
Gateway HTTP (127.0.0.1:N) ← HermesGatewayClient 探活 / Chat / Run
```

| 层级 | 模块 | 职责 |
|------|------|------|
| API | `api/v1/profiles.py`、`api/v1/gateways.py` | 薄路由，委托 Supervisor |
| 编排 | `services/gateway_supervisor.py` | Profile 状态、`STARTING`→`RUNNING`、失败恢复、启动后对 `/health` 轮询 |
| 运行时 | `runtime/gateway_process.py` | `create_subprocess_exec`、Windows 无窗启动、按 profile 记 handle |
| 集成 | `integrations/hermes/client.py` | HTTP 健康检查、`/v1/models` 等 |
| 配置 | `core/config.py` | `HERMES_GATEWAY_COMMAND`、`HERMES_HOME`、健康检查超时 |
| 生命周期 | `core/lifecycle.py` | 服务启动时 `reconcile_on_boot` + `start_auto_start_profiles`；关闭时 `shutdown_all` |

**边界**：copilot-serve **不**实现 Gateway 业务逻辑，只负责**拉起/监督** Hermes CLI 子进程，并通过 HTTP 判断 Gateway 是否就绪。

---

## 2. 状态机

定义见 `core/constants.py` → `GatewayStatus`：

| 状态 | 含义 |
|------|------|
| `stopped` | 未运行或已停止 |
| `starting` | 已发起子进程创建，尚未通过健康检查 |
| `running` | 子进程存在且 HTTP 健康检查通过 |
| `error` | 启动失败、健康检查失败、或 reconcile 发现进程已死 |
| `restarting` | 枚举中存在；当前实现由 `stop` + `start` 序列表达，较少单独落库 |

### 2.1 典型流转

```text
POST /profiles/{id}/start
  → DB: starting
  → GatewayProcessManager.start()  # spawn
  → DB: running (+ gateway_pid)
  → _wait_for_health()             # 轮询 HTTP
  → 成功: 审计 profile_started
  → 失败: DB: error + GatewayError(503)

POST /profiles/{id}/stop
  → terminate 子进程 / 按 pid 杀 / 清端口监听
  → DB: stopped, gateway_pid=null

POST /profiles/{id}/restart
  → stop → _wait_port_free(最多 5s) → start
```

### 2.2 陈旧 `starting` 恢复

`start_profile` 中：若 DB 为 `starting` 且 `updated_at` 超过 **60s**（`_STARTING_STALE_SEC`），先重置为 `stopped` 再重新启动，避免上次崩溃后永远卡在 `starting`。

---

## 3. 进程层：`GatewayProcessManager`

文件：`src/runtime/gateway_process.py`

### 3.1 内存结构

- `_handles: dict[profile_id, GatewayProcessHandle]`
- `GatewayProcessHandle`：`process`（`asyncio.subprocess.Process`）、`pid`、`log_path`、打开的日志文件句柄

同一 `profile_id` 若已有存活 handle，`start()` 直接返回，不重复 spawn。

### 3.2 命令行组装

```python
# 默认配置 HERMES_GATEWAY_COMMAND="hermes gateway"
base = shlex.split(settings.hermes_gateway_command, posix=(sys.platform != "win32"))
cmd = [*base, "--port", str(port), "--profile", profile_name]
```

| 平台 | `shlex.split` | 示例结果 |
|------|---------------|----------|
| Windows | `posix=False` | `['hermes', 'gateway', '--port', '8642', '--profile', 'default']` |
| Linux/macOS | `posix=True` | 同上（支持引号包裹含空格路径） |

**测试钩子**：`mock_command` 非空时跳过上述逻辑，直接用于 pytest（见 `GatewaySupervisor.set_mock_gateway_command`）。

### 3.3 子进程创建 `_create_gateway_process`

```python
kwargs = {
    "stdout": log_file,                      # 追加写入 gateway-{profile_name}.log
    "stderr": asyncio.subprocess.STDOUT,     # stderr 合并到 stdout
    "cwd": str(settings.hermes_home_path),   # 默认 ~/.hermes
}
# Windows 额外：
kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW  # 0x08000000
kwargs["startupinfo"] = STARTUPINFO + STARTF_USESHOWWINDOW + SW_HIDE
await asyncio.create_subprocess_exec(*cmd, **kwargs)
```

要点：

1. **`shell=False`**（asyncio 默认）：不经过 `cmd.exe`，第一个参数必须是**可执行文件**（完整路径或 PATH 能解析到的名字）。
2. **`cwd`** 只影响 Gateway 工作目录（读 `config.yaml` 等），**不能**代替 PATH 查找 `hermes`。
3. Windows 隐藏窗口参数与「找不到文件」**无关**；`creationflags`/`startupinfo` 仅控制是否弹出控制台。

### 3.4 日志

- 路径：`{LOG_DIR}/gateway-{profile_name}.log`（`LOG_DIR` 默认 `./data/logs`，相对仓库根）
- 模式：追加 `a`，UTF-8
- `read_logs(profile_id, tail=200)`：优先读内存 handle 对应文件；Supervisor 在进程已退出时还可按 `profile_name` 直接读磁盘日志

### 3.5 停止与端口清理

`stop(profile_id, pid=..., port=...)` 顺序：

1. 若有内存 `handle` 且存活 → `process.terminate()`，超时 10s 后 `kill()`
2. 否则若 DB 有 `gateway_pid` 且仍存活 → `psutil` `terminate_pid`
3. 若指定 `port` 且 `127.0.0.1:port` 仍被监听 → `terminate_listeners_on_port`（扫 `psutil.net_connections`）

`release_port(port)` / `restart` 前 `_wait_port_free`：最多等 5s，仍占用则强制 `release_port`。

### 3.6 辅助函数

| 函数 | 用途 |
|------|------|
| `is_pid_alive` | psutil 判断 |
| `terminate_pid` | terminate → 超时 kill |
| `find_pids_listening_on_port` | 查端口占用 PID（权限不足时可能为空） |

---

## 4. 编排层：`GatewaySupervisor`

文件：`src/services/gateway_supervisor.py`

### 4.1 `start_profile`

1. Profile 必须 `enabled`
2. 处理陈旧 `starting`
3. 若已在 `starting`/`running` 且本地 handle 存活 → 仅 `refresh_status`
4. DB → `starting`，commit
5. `process_manager.start(..., mock_command=self._mock_command)`
6. DB → `running`，写入 `gateway_pid`
7. `_wait_for_health(port)`：间隔 `GATEWAY_HEALTH_POLL_INTERVAL_SEC`（默认 0.5s），总超时 `GATEWAY_HEALTH_TIMEOUT_SEC`（默认 30s）
8. 健康检查失败 → DB `error`，抛 `GatewayError`（API 映射 503）
9. 任意异常 → rollback + `_recover_after_start_failure`（`starting`/`running` → `error`）+ `_wrap_start_error`

**错误包装**（`_wrap_start_error`）：

| 原始异常 | 对外 |
|----------|------|
| `FileNotFoundError` | `GatewayError: Hermes gateway command not found: …` |
| `OSError`（含 WinError 2） | `GatewayError: Failed to start gateway process: …` |
| `ConflictError` / `GatewayError` | 原样传递 |

### 4.2 `stop_profile` / `restart_profile`

- `stop`：清进程 + DB `stopped`
- `restart`：`stop` → `_wait_port_free` → `start`

### 4.3 `refresh_status` / `_compute_status`

用于 `GET …/status`、`GET …/health`：

- 对比 DB 状态、本地 handle、DB 中的 `gateway_pid`
- DB 为 `running` 但本地无 handle：若 pid 仍存活则 HTTP 探活；失败或 pid 已死 → `error`
- 本地 handle 存活但 DB 非 `running` → 修正为 `running`

### 4.4 服务启动 / 关闭（`core/lifecycle.py`）

**启动**（除非 `app.state._disable_gateway_autostart`）：

1. `reconcile_on_boot()`：DB 标记 `running` 的 Profile 与 OS 对齐  
   - 本地 handle 仍存活 → 保留  
   - pid 存活且 HTTP 健康 → 保留  
   - pid 存活但不健康 → kill，DB `error`  
   - pid 不存在 → DB `error`
2. `start_auto_start_profiles()`：`enabled` + `auto_start` + 非 running/starting → 逐个 `start_profile`（失败记审计，不阻断其他 Profile）

**关闭**：

- `shutdown_all()`：停所有 running/starting Profile 子进程 + `process_manager.shutdown_all()`

### 4.5 Chat / Task 门控

`get_profile_for_hermes(profile_id)`：先 `refresh_status`，要求 `running` 且 `healthy`，否则 `GatewayError`。  
Workspace Chat 等路径依赖 Gateway 已就绪。

---

## 5. HTTP 健康检查

`integrations/hermes/client.py` → `HermesGatewayClient.health_check()`：

- 依次请求 `GET http://127.0.0.1:{port}/health`、`/v1/models`
- 任一返回 status &lt; 500 即视为健康
- 超时 5s，失败返回 `False`（不抛异常）

---

## 6. 配置项

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| `HERMES_GATEWAY_COMMAND` | `hermes gateway` | 启动命令前缀；**建议 Windows 生产环境写 `hermes.exe` 绝对路径** |
| `HERMES_HOME` | `~/.hermes` | 子进程 `cwd` |
| `DEFAULT_GATEWAY_PORT` | `8642` | 默认 Profile 端口；`port_allocator` 从此递增扫描 |
| `LOG_DIR` | `./data/logs` | Gateway 标准输出日志目录 |
| `GATEWAY_HEALTH_TIMEOUT_SEC` | `30` | 启动后等待就绪上限 |
| `GATEWAY_HEALTH_POLL_INTERVAL_SEC` | `0.5` | 健康轮询间隔 |

示例 `.env`（Windows，与 smc-copilot-desktop 安装布局对齐）：

```env
HERMES_GATEWAY_COMMAND="C:\Users\Administrator\AppData\Local\Programs\SMC Copilot\runtime\hermes\venv\Scripts\hermes.exe gateway"
HERMES_HOME=~/.hermes
```

---

## 7. API 端点速查

| 方法 | 路径 | 行为 |
|------|------|------|
| POST | `/api/v1/profiles/{id}/start` | `start_profile` |
| POST | `/api/v1/profiles/{id}/stop` | `stop_profile` |
| POST | `/api/v1/profiles/{id}/restart` | `restart_profile` |
| GET | `/api/v1/profiles/{id}/status` | `refresh_status` |
| GET | `/api/v1/profiles/{id}/health` | 同 status |
| GET | `/api/v1/gateways/{id}/health` | `get_gateway_health`（V1.0：`gateway_id` == `profile_id`） |
| GET | `/api/v1/gateways/{id}/logs?tail=200` | `read_gateway_logs` |

---

## 8. 与 copilot-desktop 的差异

| 维度 | copilot-desktop | copilot-serve |
|------|-----------------|---------------|
| 可执行文件 | `getHermesScript()` / `resolveCopilotRuntimePaths().hermesExe` **绝对路径** | 默认裸名 `hermes`，依赖 PATH |
| 启动方式 | Node `spawn(hermesScript, ['gateway'], …)` | Python `asyncio.create_subprocess_exec` |
| 环境 | `getEnhancedPath()` 注入 venv Scripts | 继承 copilot-serve 进程环境，无额外 PATH 增强 |
| 参数 | 子命令 `gateway`（端口多由 config/env 决定） | 显式 `--port`、`--profile` |

**结论**：桌面端安装后通常能启动 Gateway；仅部署 copilot-serve 时必须在 `.env` 配置可找到的 `HERMES_GATEWAY_COMMAND`，或保证 `hermes`/`hermes.exe` 在 serve 进程的 PATH 中。

---

## 9. 故障排查

### 9.1 「系统找不到指定的文件。」（Windows）

- **含义**：`CreateProcess` 找不到 `cmd[0]`（如 `hermes`），对应 Python `FileNotFoundError` / `OSError` WinError 2。
- **常见原因**：
  1. 未安装 `hermes-agent` CLI，或 `Scripts\hermes.exe` 不在 PATH
  2. copilot-serve 以 Windows 服务运行，PATH 比交互式 Shell 更短
  3. 仅有 `hermes.cmd` 却使用裸名 `hermes`（`shell=False` 无法执行 cmd 批处理）
- **排查**：
  ```powershell
  where.exe hermes.exe
  # 在「与 serve 相同方式」启动的终端中执行；为空则需配置绝对路径
  ```
- **修复**：设置 `HERMES_GATEWAY_COMMAND` 为带引号的完整路径，例如 `"D:\...\hermes.exe gateway"`。

### 9.2 启动后健康检查失败（503）

1. `GET /api/v1/gateways/{profile_id}/logs` 查看 Gateway 日志
2. 确认端口未被占用：`gateway_port` 与 `~/.hermes/config.yaml` 一致
3. 检查 `~/.hermes/logs/gateway.log`（Hermes 自身日志，与 serve 的 `data/logs/gateway-*.log` 不同）

### 9.3 端口占用

- `restart` 会 `_wait_port_free` 最多 5s 后 `release_port`
- 仍失败：手动查 `netstat -ano | findstr :8642` 或看 serve 日志 `net_connections_denied`

### 9.4 DB `running` 但桌面显示异常

- 服务重启后依赖 `reconcile_on_boot`；若进程已死会改为 `error`
- 调用 `POST …/start` 或 `restart` 重新拉起

---

## 10. 测试

- 单测/集成测通过 `supervisor.set_mock_gateway_command([...])` 注入 mock HTTP Gateway 脚本，避免依赖真实 Hermes CLI。
- 参考：`tests/test_v1_acceptance.py`、`tests/api/test_profile_start_failure_recovery.py` 等。

---

## 11. 后续优化参考

改动时优先考虑：

1. **启动前校验**：解析 `cmd[0]`，`Path.is_file()`，失败时明确提示配置 `HERMES_GATEWAY_COMMAND`（避免笼统 WinError 2）。
2. **PATH 增强**：可选读取与 desktop 一致的 `runtime/hermes/venv/Scripts`（需约定安装布局或 env）。
3. **环境变量注入**：spawn 时合并 `HERMES_HOME`、`API_SERVER_ENABLED` 等与 desktop `startGateway` 对齐。
4. **`RESTARTING` 状态**：restart 过程中显式落库，便于 UI 展示。
5. **文档同步**：改默认命令、健康 URL 或状态机时更新本文与 `POSTMAN_GUIDE.md` / `.env.example`。

---

## 12. 相关文件索引

```text
src/runtime/gateway_process.py      # 子进程
src/services/gateway_supervisor.py  # 编排
src/integrations/hermes/client.py   # HTTP 客户端
src/runtime/port_allocator.py       # 端口分配
src/core/config.py                  # 配置
src/core/lifecycle.py               # 启动/关闭
src/core/constants.py               # GatewayStatus
src/api/v1/profiles.py
src/api/v1/gateways.py
.env.example
POSTMAN_GUIDE.md                    # Q4 Gateway 启动失败
.cursor/skills/gateway-supervisor-implementation/SKILL.md
```
