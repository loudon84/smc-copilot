# Postman Collection 使用指南

本指南说明如何使用 `postman_collection.json` 测试 Copilot Serve API。

## 一、导入 Postman Collection

1. 打开 Postman
2. 点击左上角的 `Import` 按钮
3. 选择 `postman_collection.json` 文件
4. 点击 `Import` 完成导入

## 二、配置环境变量

### 2.1 必需变量

在 Collection 变量或创建的环境中设置以下变量：

| 变量名 | 说明 | 默认值 | 是否必需 |
|--------|------|--------|----------|
| `base_url` | 服务基础 URL | `http://127.0.0.1:8765` | 是 |
| `copilot_token` | 桌面 Token | 空 | 根据配置 |

### 2.2 动态变量（自动设置）

以下变量会在测试过程中自动设置：

| 变量名 | 说明 |
|--------|------|
| `profile_id` | Profile ID |
| `run_id` | Run ID |

## 三、获取 Token 的方法

### 方法 1：从环境变量获取

检查服务启动时的环境变量：

```bash
# Linux/macOS
echo $COPILOT_DESKTOP_TOKEN

# Windows PowerShell
$env:COPILOT_DESKTOP_TOKEN

# Windows CMD
echo %COPILOT_DESKTOP_TOKEN%
```

### 方法 2：从 .env 文件获取

查看 `copilot-serve/.env` 文件：

```bash
# 查看 .env 文件
cat copilot-serve/.env | grep COPILOT_DESKTOP_TOKEN
```

### 方法 3：检查是否需要 Token

查看 `COPILOT_REQUIRE_TOKEN` 配置：

```bash
cat copilot-serve/.env | grep COPILOT_REQUIRE_TOKEN
```

- 如果 `COPILOT_REQUIRE_TOKEN=false`（默认），则**不需要** Token
- 如果 `COPILOT_REQUIRE_TOKEN=true`，则**必须**设置 Token

### 方法 4：从 Electron Desktop 获取

如果是通过 `smc-copilot-desktop` 启动：

1. Token 由桌面应用生成并注入
2. 可从桌面应用的主进程配置中获取
3. 通常在桌面应用的日志或配置文件中可以找到

## 四、设置 Token

在 Postman 中设置 Token：

### 方式 1：在 Collection 变量中设置

1. 点击 Collection 名称 `Copilot Serve - Hermes API`
2. 切换到 `Variables` 标签
3. 找到 `copilot_token` 变量
4. 在 `Current value` 列填入 Token 值

### 方式 2：创建环境变量

1. 点击右上角的齿轮图标 → `Manage Environments`
2. 点击 `Add` 创建新环境
3. 添加变量：
   - Variable: `copilot_token`
   - Value: `你的token值`
4. 选择该环境

## 五、测试流程

### 5.1 快速测试（使用完整测试流程）

1. 展开 `7. 完整测试流程` 文件夹
2. 按顺序执行以下请求：
   - `Step 1: 检查服务健康`
   - `Step 2: 获取或创建 Profile`
   - `Step 3: 启动 Gateway`
   - `Step 4: 检查 Gateway 状态`
   - `Step 5: 获取模型列表`
   - `Step 6: 停止 Gateway`

### 5.2 手动测试步骤

#### 步骤 1：检查服务是否启动

```
GET /api/v1/health
```

此接口无需 Token，可用于验证服务是否正常运行。

#### 步骤 2：获取 Profile 列表

```
GET /api/v1/profiles
```

从返回结果中选择一个 Profile ID，设置到 `profile_id` 变量中。

#### 步骤 3：启动 Gateway

```
POST /api/v1/profiles/{profile_id}/start
```

等待 Gateway 启动完成（通常需要几秒钟）。

#### 步骤 4：检查 Gateway 状态

```
GET /api/v1/profiles/{profile_id}/status
```

确认 `status` 为 `running` 且 `healthy` 为 `true`。

#### 步骤 5：获取模型列表

```
GET /api/v1/profiles/{profile_id}/models
```

获取可用的模型列表。

#### 步骤 6：创建 Run（可选）

```
POST /api/v1/profiles/{profile_id}/runs
```

创建一个新的 Run 进行测试。

#### 步骤 7：停止 Gateway

```
POST /api/v1/profiles/{profile_id}/stop
```

测试完成后停止 Gateway。

## 六、API 分类说明

### 6.1 登录与鉴权

- 健康检查（无需 Token）
- 获取系统信息
- 获取服务状态

### 6.2 Profile 管理

- CRUD 操作：创建、查询、更新、删除 Profile

### 6.3 Hermes Gateway 启停控制

- 启动、停止、重启 Gateway
- 查询状态、健康检查
- 获取事件日志

### 6.4 Gateway 管理

- 健康检查
- 日志查询

### 6.5 Hermes Models & Runs

- 获取模型列表
- 创建、查询 Run
- 获取 Run 事件

### 6.6 Workspace Chat

- Profile 解析
- 模型配置管理
- Chat Completions（SSE）
- 会话历史

## 七、常见问题

### Q1: 401 Unauthorized

**原因**：Token 未设置或错误

**解决**：
1. 检查 `COPILOT_REQUIRE_TOKEN` 是否为 `true`
2. 确认 `copilot_token` 变量已正确设置
3. 确认 Token 值与 `COPILOT_DESKTOP_TOKEN` 环境变量一致

### Q2: 503 Service Unavailable

**原因**：Gateway 未启动或不健康

**解决**：
1. 先调用 `POST /api/v1/profiles/{profile_id}/start` 启动 Gateway
2. 等待几秒钟后检查状态
3. 确认 Gateway 进程正常运行

### Q3: Profile not found

**原因**：`profile_id` 变量未设置或错误

**解决**：
1. 先调用 `GET /api/v1/profiles` 获取 Profile 列表
2. 从返回结果中复制一个 Profile ID
3. 设置到 `profile_id` 变量中

### Q4: Gateway 启动失败

**原因**：端口冲突或配置错误

**解决**：
1. 检查 `gateway_port` 是否被占用
2. 查看 Gateway 日志：`GET /api/v1/gateways/{profile_id}/logs`
3. 检查 `HERMES_GATEWAY_COMMAND` 配置是否正确

### Q5: SSE 请求无响应

**原因**：Postman 对 SSE 支持有限

**解决**：
1. 使用 `curl` 或其他支持 SSE 的工具测试
2. 或使用 Postman 的 `Send and Download` 功能

## 八、使用 curl 测试 SSE

对于 SSE 接口（如 Chat Completions），建议使用 curl：

```bash
curl -N -X POST http://127.0.0.1:8765/api/v1/profiles/{profile_id}/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Copilot-Desktop-Token: your_token" \
  -d '{
    "workspace_id": "{profile_id}",
    "session_id": "test_session",
    "stream_id": "test_stream",
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'
```

## 九、自动化测试

可以使用 Postman 的 Collection Runner 进行自动化测试：

1. 点击 Collection 名称旁的 `...` → `Run collection`
2. 选择要运行的请求
3. 点击 `Run Copilot Serve - Hermes API`
4. 查看测试结果

## 十、导出测试结果

测试完成后可以导出结果：

1. 点击 `Export Results`
2. 选择格式（JSON/CSV）
3. 保存文件

---

## 附录：环境变量完整列表

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `COPILOT_HOST` | 服务监听地址 | `127.0.0.1` |
| `COPILOT_PORT` | 服务监听端口 | `8765` |
| `COPILOT_DESKTOP_TOKEN` | 桌面 Token | 空 |
| `COPILOT_REQUIRE_TOKEN` | 是否需要 Token | `false` |
| `SQLITE_PATH` | SQLite 数据库路径 | `~/.hermes/desktop/sqlite.db` |
| `HERMES_HOME` | Hermes 主目录 | `~/.hermes` |
| `DEFAULT_GATEWAY_PORT` | 默认 Gateway 端口 | `8642` |
| `HERMES_GATEWAY_COMMAND` | Gateway 启动命令 | `hermes gateway` |
