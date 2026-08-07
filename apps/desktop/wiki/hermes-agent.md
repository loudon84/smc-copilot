---

# Hermes Agent — 架构分析文档

## 1. 系统本质

**是什么：** 一个以 `AIAgent` 为核心的、多入口、多后端的 LLM 编排运行时。它将自然语言请求转化为工具调用序列，并通过可插拔的执行后端完成实际操作。系统的核心价值在于：统一的 agent 循环 + 可扩展的工具注册表 + 跨平台交付层。

**不是什么：** 不是 LLM 框架（不训练模型）、不是 RAG 管道（记忆是辅助而非核心）、不是 workflow 引擎（无静态 DAG，全部动态工具调用）。

---

## 2. 架构设计意图

三层分离是核心设计意图：

```
┌─────────────────────────────────────────────────────┐
│  入口层 (Entry Points)                               │
│  cli.py · gateway/run.py · acp_adapter/ · batch     │
└──────────────────────┬──────────────────────────────┘
                       │ 唯一接口: AIAgent.run_conversation()
┌──────────────────────▼──────────────────────────────┐
│  编排层 (Orchestration) — run_agent.py:AIAgent       │
│  prompt_builder · runtime_provider · tool dispatch  │
│  context_compressor · iteration_budget · callbacks  │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
┌──────────▼──────────┐  ┌────────────▼──────────────┐
│  持久化层            │  │  执行后端层                 │
│  hermes_state.py    │  │  tools/environments/       │
│  SQLite + FTS5      │  │  7 terminal backends       │
└─────────────────────┘  └───────────────────────────┘
```

设计意图：**平台差异封装在入口层，不得渗透进编排层**。`AIAgent` 对 CLI、Telegram、VS Code、cron 完全无感知。 [1](#0-0) 

---

## 3. 稳定的抽象层 vs 易变的实现细节

### 稳定抽象（修改需极度谨慎）

**`AIAgent.run_conversation()` 接口契约**
入口层唯一依赖点。返回 `dict` 含 `final_response`、`messages`、`api_calls`、`completed`。任何修改都会破坏所有入口层。 [2](#0-1) 

**OpenAI 消息格式作为内部规范格式**
所有 API 模式（`chat_completions`、`codex_responses`、`anthropic_messages`）在进入 agent 循环前后都转换为 OpenAI 格式。这是系统内部的"通用语言"。 [3](#0-2) 

**`tools/registry.py` 注册协议**
工具在 import 时自注册，schema + handler 共存于同一文件。`get_tool_definitions()` 是唯一的工具发现入口。 [4](#0-3) 

**`ContextEngine` ABC**
`agent/context_engine.py` 定义可插拔的上下文管理接口，默认实现是 `ContextCompressor`。 [5](#0-4) 

**`MemoryProvider` ABC**
`agent/memory_provider.py` 定义外部记忆后端接口，单选激活。 [6](#0-5) 

### 易变实现细节

- `gateway/platforms/` 下的 20 个平台适配器 — 各自独立，可随时增删
- `tools/environments/` 下的 7 个 terminal 后端 — 新增后端只需实现接口
- `hermes_cli/auth.py:PROVIDER_REGISTRY` — 提供商列表持续扩展
- `agent/prompt_builder.py` 中的 system prompt 组装逻辑 — 频繁调整
- `cli-config.yaml` 中的所有配置键 — 通过 `config_version` 迁移机制管理

---

## 4. 显式扩展点

### Plugin Context API（最主要的扩展机制）

在 `register(ctx)` 中可调用：

| 方法 | 作用 |
|------|------|
| `ctx.register_tool(name, toolset, schema, handler, check_fn, override)` | 注册新工具，`override=True` 可替换内置工具 |
| `ctx.register_hook(event, callback)` | 订阅生命周期事件 |
| `ctx.register_command(name, handler)` | 注册 slash 命令 |
| `ctx.register_cli_command(name, ...)` | 注册 `hermes <cmd>` 子命令 |
| `ctx.register_platform(name, adapter_factory, ...)` | 注册新消息平台 |
| `ctx.register_image_gen_provider(provider)` | 注册图像生成后端 |
| `ctx.register_context_engine(engine)` | 替换上下文压缩策略 |
| `ctx.llm.complete(...)` | 借用用户的 LLM 凭证做一次性推理 | [7](#0-6) 

### Hook 事件系统

完整事件列表（`VALID_HOOKS`）：

| Hook | 触发时机 | 返回值影响 |
|------|---------|-----------|
| `pre_tool_call` | 工具执行前 | `{"action": "block", "message": ...}` 可阻断 |
| `post_tool_call` | 工具执行后 | 忽略 |
| `pre_llm_call` | 每轮 LLM 调用前 | `{"context": ...}` 注入用户消息 |
| `post_llm_call` | 每轮 LLM 调用后 | 忽略 |
| `transform_tool_result` | 工具结果返回模型前 | `str` 替换结果 |
| `transform_terminal_output` | terminal 输出截断前 | `str` 替换原始输出 |
| `transform_llm_output` | 最终响应交付前 | `str` 替换响应文本 |
| `pre_gateway_dispatch` | 网关收到消息、鉴权前 | `{"action": "skip"/"rewrite"/"allow"}` |
| `on_session_start/end/finalize/reset` | 会话生命周期 | 忽略 |
| `subagent_stop` | `delegate_task` 子 agent 退出后 | 忽略 | [8](#0-7) 

Shell hooks 通过 `config.yaml` 的 `hooks:` 块声明，走相同的 dispatcher，无需写 Python。 [9](#0-8) 

### 隐式扩展点

- **`gateway/builtin_hooks/`** — 空目录，设计为始终加载的 hook 的放置位置
- **`optional-skills/`** — 官方可选 skill 目录，通过 `hermes skills install` 激活
- **`skills/`** — 捆绑 skill，始终可用，agent 可通过 `skill_manage` 工具自主创建新 skill
- **`mcp_servers` 配置** — 任意 MCP 服务器的工具自动注册进 registry
- **`providers.<id>` 配置块** — 每个提供商可独立配置超时、模型级别覆盖

---

## 5. 不可违反的不变式

### 消息序列不变式（最关键）

```
system → user → assistant → [tool × N] → user → assistant → ...
```

- 绝不允许连续两条 `user` 消息（系统在 API 调用前自动合并）
- 绝不允许连续两条 `assistant` 消息
- `tool` 消息必须紧跟在含 `tool_calls` 的 `assistant` 消息之后
- 每个 `tool_call_id` 必须有对应的 `tool` 结果（压缩后用 stub 补全）

违反此不变式会导致大多数提供商返回空响应，触发无限重试循环。 [10](#0-9) [11](#0-10) 

### 工具返回值不变式

所有工具 handler 必须返回 `str`（通常是 JSON 字符串），绝不能抛出异常。Registry 有双层 try/except 保证模型始终收到格式良好的错误 JSON。 [12](#0-11) 

### 系统提示不变式

System prompt 在对话中途不可变更（除非用户显式执行 `/model` 等操作）。中途修改会破坏 Anthropic prompt caching 的 prefix 匹配，导致缓存失效。 [13](#0-12) 

### Ephemeral 注入不变式

Budget warnings、context pressure 等 ephemeral 内容只注入 API 调用时的 wire copy，绝不持久化到 session DB 或日志。 [14](#0-13) 

### Agent-level 工具拦截不变式

`todo`、`memory`、`session_search`、`delegate_task` 这四个工具在 registry dispatch 之前被 agent loop 拦截处理，它们的 schema 在 registry 中存在但 handler 是 stub。任何新增需要 agent 状态的工具都必须走同样的拦截路径。 [15](#0-14) 

---

## 6. 系统预期生命周期

```
安装 → hermes setup（首次向导）
     → hermes model（配置提供商）
     → hermes chat（交互使用）
     → hermes gateway start（后台服务化）
     → hermes skills install（能力扩展）
     → hermes plugins install（深度扩展）
     → hermes update（版本升级，热重载部分配置）
     → hermes profile create（多实例隔离）
     → hermes backup / import（迁移）
```

**配置演化机制：** `config_version` 字段 + `hermes config migrate` 命令管理 breaking changes。当前版本 v21+。新增配置键必须有默认值，通过 `DEFAULT_CONFIG` 在 `hermes_cli/config.py` 中声明。 [16](#0-15) 

**Gateway 热重载：** `model.context_length` 和 `compression.*` 键修改后无需重启，下一条消息生效。API keys 和工具配置仍需重启。 [17](#0-16) 

---

## 7. CLI 命令完整清单

### 顶层命令

`hermes [--version|-V] [--profile|-p <name>] [--resume|-r <session>] [--continue|-c [name]] [--worktree|-w] [--yolo] [--pass-session-id] [--ignore-user-config] [--ignore-rules] [--tui] [--dev]` [18](#0-17) 

| 命令 | 子命令 |
|------|--------|
| `hermes chat` | `-q`, `-m`, `-t`, `--provider`, `-s`, `-v`, `-Q`, `--image`, `--resume`, `--continue`, `--worktree`, `--checkpoints`, `--yolo`, `--pass-session-id`, `--ignore-user-config`, `--ignore-rules`, `--source`, `--max-turns` |
| `hermes -z <prompt>` | `--provider`, `-m` (纯 stdout 单次调用) |
| `hermes model` | 交互式向导 |
| `hermes fallback` | `list`, `add`, `remove`, `clear` |
| `hermes gateway` | `run`, `start`, `stop`, `restart`, `status`, `list`, `install`, `uninstall`, `setup`; `--all` |
| `hermes lsp` | `status`, `list [--installed-only]`, `install <id>`, `install-all`, `restart`, `which <id>` |
| `hermes setup` | `[model\|tts\|terminal\|gateway\|tools\|agent]`; `--quick`, `--non-interactive`, `--reset`, `--reconfigure`, `--portal` |
| `hermes portal` | `status`, `open`, `tools` |
| `hermes whatsapp` | (交互式配对) |
| `hermes slack` | `manifest [--write [PATH]] [--name NAME] [--description DESC] [--slashes-only]` |
| `hermes auth` | `list [provider]`, `add <provider> [--api-key\|--type oauth]`, `remove <provider> <index>`, `reset <provider>`, `status <provider>`, `logout <provider>`, `spotify` |
| `hermes status` | `[--all] [--deep]` |
| `hermes cron` | `list`, `create/add [--skill]`, `edit [--clear-skills\|--add-skill\|--remove-skill]`, `pause`, `resume`, `run`, `remove`, `status`, `tick` |
| `hermes kanban` | `[--board <slug>]` + `init`, `boards list/create/switch/show/rename/rm`, `create`, `list`, `show`, `assign`, `link`, `unlink`, `claim`, `comment`, `complete`, `block`, `schedule`, `unblock`, `archive`, `tail`, `dispatch [--dry-run\|--max\|--failure-limit]`, `context`, `specify [--all]`, `decompose [--all]`, `gc` |
| `hermes webhook` | `subscribe/add [--prompt\|--events\|--description\|--skills\|--deliver\|--deliver-chat-id\|--secret\|--deliver-only]`, `list/ls`, `remove/rm`, `test` |
| `hermes hooks` | `list/ls`, `test <event>`, `revoke/remove/rm`, `doctor` |
| `hermes doctor` | `[--fix]` |
| `hermes dump` | `[--show-keys]` |
| `hermes debug` | `share [--lines N] [--expire days] [--local]` |
| `hermes backup` | `[-o path] [-q/--quick] [-l/--label]` |
| `hermes checkpoints` | `status/list [--limit N]`, `prune [--retention-days\|--max-size-mb\|--keep-orphans]`, `clear [-f]`, `clear-legacy [-f]` |
| `hermes import` | `<zipfile> [-f]` |
| `hermes logs` | `[agent\|errors\|gateway\|list] [-n N] [-f] [--level] [--session] [--since] [--component]` |
| `hermes config` | `show`, `edit`, `set <key> <value>`, `path`, `env-path`, `check`, `migrate` |
| `hermes pairing` | `list`, `approve <platform> <code>`, `revoke <platform> <user-id>`, `clear-pending` |
| `hermes skills` | `browse [--source]`, `search`, `install [--force\|--name]`, `inspect`, `list`, `check`, `update`, `audit`, `uninstall`, `reset [--restore]`, `publish`, `snapshot`, `tap`, `config` |
| `hermes bundles` | `list`, `show <name>`, `create <name> [--skill\|--description\|--instruction\|--force]`, `delete <name>`, `reload` |
| `hermes curator` | `status`, `run [--background\|--dry-run]`, `backup`, `rollback [--list\|--id\|--y]`, `pause`, `resume`, `pin/unpin <skill>`, `restore/archive <skill>`, `prune`, `list-archived` |
| `hermes memory` | `setup`, `status`, `off` |
| `hermes acp` | (启动 ACP stdio 服务) |
| `hermes mcp` | `serve [-v]`, `add <name> [--url\|--command\|--args\|--auth]`, `remove/rm`, `list/ls`, `test`, `configure/config`, `login` |
| `hermes plugins` | `install <id> [--force]`, `update`, `remove/rm/uninstall`, `enable`, `disable`, `list/ls` |
| `hermes portal` | `status`, `open`, `tools` |
| `hermes tools` | `[--summary]` |
| `hermes computer-use` | `install [--upgrade]`, `status` |
| `hermes sessions` | `list`, `browse`, `export <output> [--session-id]`, `delete`, `prune`, `stats`, `rename` |
| `hermes insights` | `[--days N] [--source platform]` |
| `hermes claw` | `migrate [--dry-run\|--preset\|--overwrite\|--migrate-secrets\|--no-backup\|--source\|--workspace-target\|--skill-conflict\|--yes]` |
| `hermes dashboard` | `[--port] [--host] [--no-open] [--tui] [--insecure] [--stop] [--status]` |
| `hermes profile` | `list`, `use`, `create [--clone\|--clone-all\|--clone-from\|--no-alias]`, `delete [-y]`, `show`, `alias [--remove\|--name]`, `rename`, `export [-o]`, `import [--name]`, `install [--name\|--alias\|--force\|-y]`, `update [--force-config\|-y]`, `info` |
| `hermes completion` | `[bash\|zsh\|fish]` |
| `hermes update` | `[--check] [--backup] [--restart-gateway]` |
| `hermes version` | |
| `hermes uninstall` | `[--full] [--yes]` | [19](#0-18) 

---

## 8. config.yaml 参数说明

### 模型配置（核心）

```yaml
model:
  default: "anthropic/claude-opus-4.6"   # 主模型，可被 --model 覆盖
  provider: "auto"                        # 见下方提供商列表
  base_url: "https://openrouter.ai/api/v1"
  api_key: ""                             # 优先用 .env
  context_length: 131072                  # 留空=自动检测；仅在自动检测错误时手动设置
  max_tokens: 8192                        # 单次响应最大 token 数，留空=模型上限
  auth_mode: "entra_id"                   # Azure Foundry keyless auth
```

**`model.provider` 合法值：**
`auto` | `openrouter` | `nous` | `nous-api` | `anthropic` | `openai-codex` | `copilot` | `gemini` | `google-gemini-cli` | `zai` | `kimi-coding` | `kimi-coding-cn` | `minimax` | `minimax-cn` | `minimax-oauth` | `huggingface` | `nvidia` | `xiaomi` | `arcee` | `ollama-cloud` | `kilocode` | `ai-gateway` | `azure-foundry` | `lmstudio` | `deepseek` | `xai` | `xai-oauth` | `qwen-oauth` | `bedrock` | `gmi` | `alibaba` | `stepfun` | `tencent-tokenhub` | `custom`（别名：`ollama`、`vllm`、`llamacpp`） [20](#0-19) 

### 多模型配置（auxiliary）

每个辅助任务独立配置，三键模式统一：`provider` + `model` + `base_url`。

```yaml
auxiliary:
  vision:           # 图像分析 + 浏览器截图
    provider: "auto"
    model: ""
    base_url: ""
    api_key: ""
    timeout: 120          # LLM 调用超时（秒）
    download_timeout: 30  # 图片 HTTP 下载超时

  web_extract:      # 网页摘要 + 浏览器文本提取
    provider: "auto"
    model: ""
    timeout: 360

  approval:         # 危险命令自动审批分类器
    provider: "auto"
    model: ""
    timeout: 30

  compression:      # 上下文压缩摘要模型
    provider: "auto"
    model: ""
    base_url: ""
    timeout: 120
    # 注意：压缩模型的 context window 必须 >= 主模型，否则中间轮次会被静默丢弃

  session_search:   # 历史会话搜索摘要
    provider: "auto"
    model: ""
    timeout: 30
    max_concurrency: 3
    extra_body: {}

  skills_hub:       # Skill 匹配和搜索
    provider: "auto"
    model: ""
    timeout: 30

  mcp:              # MCP 工具分发
    provider: "auto"
    model: ""
    timeout: 30

  triage_specifier: # Kanban triage 任务规格化
    provider: "auto"
    model: ""
    timeout: 120

  kanban_decomposer: # Kanban 任务分解
    provider: "auto"
    model: ""
    timeout: 120

  title_generation: # 会话标题生成
    provider: "auto"
    model: ""

  profile_describer: # Profile 描述生成
    provider: "auto"
    model: ""
```

**`auxiliary.*.provider` 合法值：** `auto` | `main` | `openrouter` | `nous` | `codex` | `minimax-oauth` | `xai-oauth` | `gemini` | `ollama-cloud` | 以及所有主模型提供商名称。`"main"` 表示复用主模型的提供商，**仅在 auxiliary 块内有效**。 [21](#0-20) 

### 提供商级别超时覆盖

```yaml
providers:
  anthropic:
    request_timeout_seconds: 30
    stale_timeout_seconds: 300
    models:
      claude-opus-4.6:
        timeout_seconds: 600
        stale_timeout_seconds: 1800
``` [22](#0-21) 

### Fallback 模型

```yaml
fallback_model:
  provider: "openrouter"
  model: "google/gemini-3-flash-preview"
  base_url: ""
```

主模型 429/5xx/401 时按顺序尝试 `fallback_providers` 列表（通过 `hermes fallback add` 管理）。

### OpenRouter 路由控制

```yaml
provider_routing:
  sort: "throughput"        # price | throughput | latency
  only: ["anthropic"]       # 白名单
  ignore: ["deepinfra"]     # 黑名单
  order: ["anthropic", "google"]
  require_parameters: true
  data_collection: "deny"   # allow | deny

openrouter:
  response_cache: true
  response_cache_ttl: 300   # 秒，1-86400
``` [23](#0-22) 

### 上下文压缩

```yaml
compression:
  enabled: true
  threshold: 0.50           # 触发压缩的上下文占用比例
  target_ratio: 0.20        # 压缩后保留的尾部比例
  protect_last_n: 20        # 始终保留的最近消息数
  protect_first_n: 3        # 始终保留的头部消息数（除 system prompt 外）
  hygiene_hard_message_limit: 400  # Gateway 强制压缩的消息数上限

prompt_caching:
  cache_ttl: "5m"           # "5m" | "1h"（Anthropic prefix caching TTL）
``` [24](#0-23) 

### Agent 行为

```yaml
agent:
  max_turns: 60                    # 每轮对话最大工具调用迭代次数
  api_max_retries: 3               # 切换 fallback 前的重试次数
  reasoning_effort: "medium"       # none | minimal | low | medium | high | xhigh
  tool_use_enforcement: "auto"     # auto | true | false | ["model-substring"]
  verbose: false
  gateway_timeout: 1800            # 秒，0=无限
  gateway_timeout_warning: 900
  restart_drain_timeout: 60
  disabled_toolsets: []            # 全局禁用的 toolset 名称列表
``` [25](#0-24) 

### 子 Agent 委托

```yaml
delegation:
  max_iterations: 50
  max_concurrent_children: 3      # 并行子 agent 上限，超过 10 线性倍增 API 成本
  max_spawn_depth: 1              # 委托树深度上限（1-3）
  orchestrator_enabled: true
  subagent_auto_approve: false    # cron/batch 场景设为 true
  inherit_mcp_toolsets: true
  model: ""                       # 子 agent 模型覆盖
  provider: ""
``` [26](#0-25) 

### 工具输出截断

```yaml
tool_output:
  max_bytes: 50000        # terminal 输出字符上限
  max_lines: 2000         # read_file 单次行数上限
  max_line_length: 2000   # read_file 单行字符上限

file_read_max_chars: 100000  # read_file 单次字符上限

code_execution:
  timeout: 300
  max_tool_calls: 50

tool_loop_guardrails:
  warnings_enabled: true
  hard_stop_enabled: false
  warn_after:
    exact_failure: 2
    same_tool_failure: 3
    idempotent_no_progress: 2
  hard_stop_after:
    exact_failure: 5
    same_tool_failure: 8
    idempotent_no_progress: 5
``` [27](#0-26) 

### 其他关键配置块

```yaml
memory:
  memory_enabled: true
  user_profile_enabled: true
  memory_char_limit: 2200     # ~800 tokens
  user_char_limit: 1375       # ~500 tokens
  nudge_interval: 10
  flush_min_turns: 6

session_reset:
  mode: both                  # both | idle | daily | none
  idle_minutes: 1440
  at_hour: 4

context:
  engine: "compressor"        # 或插件名称，如 "lcm"

skills:
  creation_nudge_interval: 15
  guard_agent_created: false
  external_dirs: []

credential_pool_strategies:
  openrouter: round_robin     # fill_first | round_robin | least_used | random

display:
  tool_progress: all          # off | new | all | verbose
  streaming: true
  show_reasoning: false
  busy_input_mode: interrupt  # interrupt | queue | steer
  compact: false
  bell_on_complete: false
  language: en                # en | zh | zh-hant | ja | de | es | fr | tr | uk | af | ko | it | ga | pt | ru | hu

worktree: false               # 始终创建 git worktree 隔离

group_sessions_per_user: true

streaming:
  enabled: false              # Gateway 流式推送
  transport: edit
  edit_interval: 0.3
  buffer_threshold: 40

privacy:
  redact_pii: false

security:
  tirith_enabled: false       # 可选的命令安全扫描
``` [28](#0-27) 

---

## 9. 新增功能的归属位置

| 功能类型 | 归属位置 |
|---------|---------|
| 新 LLM 工具 | `tools/<name>_tool.py`，调用 `registry.register()` 自注册 |
| 需要 agent 状态的工具（读写 session/memory） | `run_agent.py` 中的 agent-loop 拦截路径 + `agent/tool_executor.py` |
| 新消息平台 | `gateway/platforms/<name>.py` + `ctx.register_platform()` |
| 新 LLM 提供商 | `plugins/model-providers/<name>/` + `register_provider(ProviderProfile(...))` |
| 新 terminal 执行后端 | `tools/environments/<name>.py` |
| 跨会话记忆策略 | `plugins/memory/<name>/`，继承 `MemoryProvider` |
| 上下文管理策略 | `plugins/context_engine/<name>/`，继承 `ContextEngine` |
| 观测/审计/拦截逻辑 | Plugin hook（`pre_tool_call` 阻断，`pre_llm_call` 注入） |
| 新 CLI 子命令 | `ctx.register_cli_command()` 或 `hermes_cli/main.py` |
| 新 slash 命令 | `hermes_cli/commands.py:COMMAND_REGISTRY` |

---

## 10. 高风险修改类型

**极高风险：**
- 修改 `AIAgent.run_conversation()` 的返回结构 — 破坏所有入口层
- 修改内部消息格式（OpenAI 格式）— 破坏所有 API 适配器和压缩器
- 修改 `tools/registry.py` 的注册协议 — 破坏所有工具文件
- 修改 `agent/context_compressor.py` 的 `_sanitize_tool_pairs()` — 可能产生 API 拒绝的消息序列

**高风险：**
- 修改 `agent/prompt_builder.py` 的 system prompt 结构 — 破坏 Anthropic prompt caching，影响所有会话
- 修改 `hermes_cli/auth.py:PROVIDER_REGISTRY` 中已有提供商的 key — 破坏现有用户的 `config.yaml`
- 修改 `hermes_state.py` 的 SQLite schema — 需要迁移脚本，否则破坏现有会话数据
- 修改 `hermes_cli/config.py:DEFAULT_CONFIG` 中已有键的默认值 — 影响所有未显式配置的用户

**中等风险：**
- 新增 `agent/conversation_loop.py` 中的循环条件 — 可能影响 iteration budget 计算
- 修改 `gateway/run.py:GatewayRunner` 的会话路由逻辑 — 影响所有消息平台
- 修改 `model_tools.py:get_tool_definitions()` 的过滤逻辑 — 影响所有平台的工具可见性 [29](#0-28)

### Citations

**File:** website/docs/developer-guide/architecture.md (L63-66)
```markdown
├── agent/                    # Agent internals
│   ├── prompt_builder.py     # System prompt assembly
│   ├── context_engine.py     # ContextEngine ABC (pluggable)
│   ├── context_compressor.py # Default engine — lossy summarization
```

**File:** website/docs/developer-guide/architecture.md (L254-276)
```markdown
## Design Principles

| Principle | What it means in practice |
|-----------|--------------------------|
| **Prompt stability** | System prompt doesn't change mid-conversation. No cache-breaking mutations except explicit user actions (`/model`). |
| **Observable execution** | Every tool call is visible to the user via callbacks. Progress updates in CLI (spinner) and gateway (chat messages). |
| **Interruptible** | API calls and tool execution can be cancelled mid-flight by user input or signals. |
| **Platform-agnostic core** | One AIAgent class serves CLI, gateway, ACP, batch, and API server. Platform differences live in the entry point, not the agent. |
| **Loose coupling** | Optional subsystems (MCP, plugins, memory providers, RL environments) use registry patterns and check_fn gating, not hard dependencies. |
| **Profile isolation** | Each profile (`hermes -p <name>`) gets its own HERMES_HOME, config, memory, sessions, and gateway PID. Multiple profiles run concurrently. |

## File Dependency Chain

```text
tools/registry.py  (no deps — imported by all tool files)
       ↑
tools/*.py  (each calls registry.register() at import time)
       ↑
model_tools.py  (imports tools/registry + triggers tool discovery)
       ↑
run_agent.py, cli.py, batch_runner.py, environments/
```

```

**File:** website/docs/developer-guide/agent-loop.md (L26-39)
```markdown
```python
# Simple interface — returns final response string
response = agent.chat("Fix the bug in main.py")

# Full interface — returns dict with messages, metadata, usage stats
result = agent.run_conversation(
    user_message="Fix the bug in main.py",
    system_message=None,           # auto-built if omitted
    conversation_history=None,      # auto-loaded from session if omitted
    task_id="task_abc123"
)
```

`chat()` is a thin wrapper around `run_conversation()` that extracts the `final_response` field from the result dict.
```

**File:** website/docs/developer-guide/agent-loop.md (L81-92)
```markdown
### Message Format

All messages use OpenAI-compatible format internally:

```python
{"role": "system", "content": "..."}
{"role": "user", "content": "..."}
{"role": "assistant", "content": "...", "tool_calls": [...]}
{"role": "tool", "tool_call_id": "...", "content": "..."}
```

Reasoning content (from models that support extended thinking) is stored in `assistant_msg["reasoning"]` and optionally displayed via the `reasoning_callback`.
```

**File:** website/docs/user-guide/features/plugins.md (L98-116)
```markdown
| Capability | How |
|-----------|-----|
| Add tools | `ctx.register_tool(name=..., toolset=..., schema=..., handler=...)` |
| Add hooks | `ctx.register_hook("post_tool_call", callback)` |
| Add slash commands | `ctx.register_command(name, handler, description)` — adds `/name` in CLI and gateway sessions |
| Dispatch tools from commands | `ctx.dispatch_tool(name, args)` — invokes a registered tool with parent-agent context auto-wired |
| Add CLI commands | `ctx.register_cli_command(name, help, setup_fn, handler_fn)` — adds `hermes <plugin> <subcommand>` |
| Inject messages | `ctx.inject_message(content, role="user")` — see [Injecting Messages](#injecting-messages) |
| Ship data files | `Path(__file__).parent / "data" / "file.yaml"` |
| Bundle skills | `ctx.register_skill(name, path)` — namespaced as `plugin:skill`, loaded via `skill_view("plugin:skill")` |
| Gate on env vars | `requires_env: [API_KEY]` in plugin.yaml — prompted during `hermes plugins install` |
| Distribute via pip | `[project.entry-points."hermes_agent.plugins"]` |
| Register a gateway platform (Discord, Telegram, IRC, …) | `ctx.register_platform(name, label, adapter_factory, check_fn, ...)` — see [Adding Platform Adapters](/docs/developer-guide/adding-platform-adapters) |
| Register an image-generation backend | `ctx.register_image_gen_provider(provider)` — see [Image Generation Provider Plugins](/docs/developer-guide/image-gen-provider-plugin) |
| Register a video-generation backend | `ctx.register_video_gen_provider(provider)` — see [Video Generation Provider Plugins](/docs/developer-guide/video-gen-provider-plugin) |
| Register a context-compression engine | `ctx.register_context_engine(engine)` — see [Context Engine Plugins](/docs/developer-guide/context-engine-plugin) |
| Register a memory backend | Subclass `MemoryProvider` in `plugins/memory/<name>/__init__.py` — see [Memory Provider Plugins](/docs/developer-guide/memory-provider-plugin) (uses a separate discovery system) |
| Run a host-owned LLM call | `ctx.llm.complete(...)` / `ctx.llm.complete_structured(...)` — borrow the user's active model + auth for a one-shot completion with optional JSON schema validation. See [Plugin LLM Access](/docs/developer-guide/plugin-llm-access) |
| Register an inference backend (LLM provider) | `register_provider(ProviderProfile(...))` in `plugins/model-providers/<name>/__init__.py` — see [Model Provider Plugins](/docs/developer-guide/model-provider-plugin) (uses a separate discovery system) |
```

**File:** website/docs/user-guide/features/plugins.md (L211-218)
```markdown
| Type | What it does | Selection | Location |
|------|-------------|-----------|----------|
| **General plugins** | Add tools, hooks, slash commands, CLI commands | Multi-select (enable/disable) | `~/.hermes/plugins/` |
| **Memory providers** | Replace or augment built-in memory | Single-select (one active) | `plugins/memory/` |
| **Context engines** | Replace the built-in context compressor | Single-select (one active) | `plugins/context_engine/` |
| **Model providers** | Declare an inference backend (OpenRouter, Anthropic, …) | Multi-register, picked by `--provider` / `config.yaml` | `plugins/model-providers/` |

Memory providers and context engines are **provider plugins** — only one of each type can be active at a time. Model providers are also plugins, but many load simultaneously; the user picks one at a time via `--provider` or `config.yaml`. General plugins can be enabled in any combination.
```

**File:** website/docs/user-guide/features/hooks.md (L374-391)
```markdown
| Hook | Fires when | Returns |
|------|-----------|---------|
| [`pre_tool_call`](#pre_tool_call) | Before any tool executes | `{"action": "block", "message": str}` to veto the call |
| [`post_tool_call`](#post_tool_call) | After any tool returns | ignored |
| [`pre_llm_call`](#pre_llm_call) | Once per turn, before the tool-calling loop | `{"context": str}` to prepend context to the user message |
| [`post_llm_call`](#post_llm_call) | Once per turn, after the tool-calling loop | ignored |
| [`on_session_start`](#on_session_start) | New session created (first turn only) | ignored |
| [`on_session_end`](#on_session_end) | Session ends | ignored |
| [`on_session_finalize`](#on_session_finalize) | CLI/gateway tears down an active session (flush, save, stats) | ignored |
| [`on_session_reset`](#on_session_reset) | Gateway swaps in a fresh session key (e.g. `/new`, `/reset`) | ignored |
| [`subagent_stop`](#subagent_stop) | A `delegate_task` child has exited | ignored |
| [`pre_gateway_dispatch`](#pre_gateway_dispatch) | Gateway received a user message, before auth + dispatch | `{"action": "skip" \| "rewrite" \| "allow", ...}` to influence flow |
| [`pre_approval_request`](#pre_approval_request) | Dangerous command needs user approval, before the prompt/notification is sent | ignored |
| [`post_approval_response`](#post_approval_response) | User responded to an approval prompt (or it timed out) | ignored |
| [`transform_tool_result`](#transform_tool_result) | After any tool returns, before the result is handed back to the model | `str` to replace the result, `None` to leave unchanged |
| [`transform_terminal_output`](#transform_terminal_output) | Inside the `terminal` tool, before truncation/ANSI-strip/redact | `str` to replace the raw output, `None` to leave unchanged |
| [`transform_llm_output`](#transform_llm_output) | After the tool-calling loop completes, before the final response is delivered | `str` to replace the response text, `None`/empty to leave unchanged |

```

**File:** cli-config.yaml.example (L8-47)
```text
model:
  # Default model to use (can be overridden with --model flag)
  # Both "default" and "model" work as the key name here.
  default: "anthropic/claude-opus-4.6"
  
  # Inference provider selection:
  #   "auto"         - Auto-detect from credentials (default)
  #   "openrouter"   - OpenRouter (requires: OPENROUTER_API_KEY or OPENAI_API_KEY)
  #   "nous"         - Nous Portal OAuth (requires: hermes login)
  #   "nous-api"     - Nous Portal API key (requires: NOUS_API_KEY)
  #   "anthropic"    - Direct Anthropic API (requires: ANTHROPIC_API_KEY)
  #   "openai-codex" - OpenAI Codex (requires: hermes auth)
  #   "copilot"      - GitHub Copilot / GitHub Models (requires: GITHUB_TOKEN)
  #   "gemini"      - Use Google AI Studio direct (requires: GOOGLE_API_KEY or GEMINI_API_KEY)
  #   "zai"         - Use z.ai / ZhipuAI GLM models (requires: GLM_API_KEY)
  #   "kimi-coding"  - Kimi / Moonshot AI (requires: KIMI_API_KEY)
  #   "minimax"      - MiniMax global (requires: MINIMAX_API_KEY)
  #   "minimax-cn"   - MiniMax China (requires: MINIMAX_CN_API_KEY)
  #   "huggingface"  - Hugging Face Inference (requires: HF_TOKEN)
  #   "nvidia"       - NVIDIA NIM / build.nvidia.com (requires: NVIDIA_API_KEY)
  #   "xiaomi"       - Xiaomi MiMo (requires: XIAOMI_API_KEY)
  #   "arcee"        - Arcee AI Trinity models (requires: ARCEEAI_API_KEY)
  #   "ollama-cloud" - Ollama Cloud (requires: OLLAMA_API_KEY — https://ollama.com/settings)
  #   "kilocode"     - KiloCode gateway (requires: KILOCODE_API_KEY)
  #   "ai-gateway"   - Vercel AI Gateway (requires: AI_GATEWAY_API_KEY)
  #   "azure-foundry" - Microsoft Foundry / Azure OpenAI (API key or Entra ID)
  #   "lmstudio"     - LM Studio local server (optional: LM_API_KEY, defaults to http://127.0.0.1:1234/v1)
  #
  # Local servers (LM Studio, Ollama, vLLM, llama.cpp):
  #   "custom"       - Any other OpenAI-compatible endpoint. Set base_url below.
  #   Aliases: "ollama", "vllm", "llamacpp" all map to "custom".
  #   LM Studio is first-class and uses provider: "lmstudio".
  #   It works with both no-auth and auth-enabled server modes.
  #
  # Can also be overridden for a single invocation with the --provider flag.
  provider: "auto"
  
  # API configuration (falls back to OPENROUTER_API_KEY env var)
  # api_key: "your-key-here"  # Uncomment to set here instead of .env
  base_url: "https://openrouter.ai/api/v1"
```

**File:** cli-config.yaml.example (L93-106)
```text
# providers:
#   ollama-local:
#     request_timeout_seconds: 300   # Longer timeout for local cold-starts
#     stale_timeout_seconds: 900     # Explicitly re-enable stale detection on local endpoints
#   anthropic:
#     request_timeout_seconds: 30    # Fast-fail cloud requests
#     models:
#       claude-opus-4.6:
#         timeout_seconds: 600       # Longer timeout for extended-thinking Opus calls
#   openai-codex:
#     models:
#       gpt-5.4:
#         stale_timeout_seconds: 1800  # Longer non-stream stale timeout for slow large-context turns

```

**File:** cli-config.yaml.example (L107-143)
```text
# =============================================================================
# OpenRouter Provider Routing (only applies when using OpenRouter)
# =============================================================================
# Control how requests are routed across providers on OpenRouter.
# See: https://openrouter.ai/docs/guides/routing/provider-selection
#
# provider_routing:
#   # Sort strategy: "price" (default), "throughput", or "latency"
#   # Append :nitro to model name for a shortcut to throughput sorting.
#   sort: "throughput"
#
#   # Only allow these providers (provider slugs from OpenRouter)
#   # only: ["anthropic", "google"]
#
#   # Skip these providers entirely
#   # ignore: ["deepinfra", "fireworks"]
#
#   # Try providers in this order (overrides default load balancing)
#   # order: ["anthropic", "google", "together"]
#
#   # Require providers to support all parameters in your request
#   # require_parameters: true
#
#   # Data policy: "allow" (default) or "deny" to exclude providers that may store data
#   # data_collection: "deny"

# =============================================================================
# OpenRouter Response Caching (only applies when using OpenRouter)
# =============================================================================
# Cache identical API responses at the OpenRouter edge for free instant replays.
# When enabled, identical requests (same model, messages, parameters) return
# cached responses with zero billing. Separate from Anthropic prompt caching.
# See: https://openrouter.ai/docs/guides/features/response-caching
#
# openrouter:
#   response_cache: true         # Enable response caching (default: true)
#   response_cache_ttl: 300      # Cache TTL in seconds, 1-86400 (default: 300)
```

**File:** cli-config.yaml.example (L326-337)
```text
tool_loop_guardrails:
  warnings_enabled: true
  hard_stop_enabled: false
  warn_after:
    exact_failure: 2
    same_tool_failure: 3
    idempotent_no_progress: 2
  hard_stop_after:
    exact_failure: 5
    same_tool_failure: 8
    idempotent_no_progress: 5

```

**File:** cli-config.yaml.example (L356-399)
```text
compression:
  # Enable automatic context compression (default: true)
  # Set to false if you prefer to manage context manually or want errors on overflow
  enabled: true
  
  # Trigger compression at this % of model's context limit (default: 0.50 = 50%)
  # Lower values = more aggressive compression, higher values = compress later
  threshold: 0.50
  
  # Fraction of the threshold to preserve as recent tail (default: 0.20 = 20%)
  # e.g. 20% of 50% threshold = 10% of total context kept as recent messages.
  # Summary output is separately capped at 12K tokens (Gemini output limit).
  # Range: 0.10 - 0.80
  target_ratio: 0.20

  # Number of most-recent messages to always preserve (default: 20 ≈ 10 full turns)
  # Higher values keep more recent conversation intact at the cost of more aggressive
  # compression of older turns.
  protect_last_n: 20

  # Number of non-system messages to protect at the head of the transcript, in
  # ADDITION to the system prompt (which is always implicitly protected).
  # Head messages are NEVER summarized — they survive every compression
  # indefinitely. This gives stable early context for short/medium sessions,
  # but in long-running sessions that rely on rolling compaction the pinned
  # opening turns may not match how you want the session framed over time.
  # Set to 0 to preserve ONLY the system prompt (plus the rolling summary
  # and recent tail) — the cleanest configuration for long-running sessions.
  # Default 3 preserves the system prompt plus the first three non-system
  # head messages, matching the pre-feature behaviour.
  protect_first_n: 3

  # To pin a specific model/provider for compression summaries, use the
  # auxiliary section below (auxiliary.compression.provider / model).

# =============================================================================
# Anthropic prompt caching TTL
# =============================================================================
# When prompt caching is active (Claude via OpenRouter or native Anthropic),
# Anthropic supports two TTL tiers for cached prefixes: "5m" (default) and
# "1h". Other values are ignored and "5m" is used.
#
prompt_caching:
  cache_ttl: "5m" # use "1h" for long sessions with pauses between turns
```

**File:** cli-config.yaml.example (L471-560)
```text
memory:
  # Agent's personal notes: environment facts, conventions, things learned
  memory_enabled: true
  
  # User profile: preferences, communication style, expectations
  user_profile_enabled: true
  
  # Character limits (~2.75 chars per token, model-independent)
  memory_char_limit: 2200   # ~800 tokens
  user_char_limit: 1375     # ~500 tokens

  # Periodic memory nudge: remind the agent to consider saving memories
  # every N user turns. Set to 0 to disable. Only active when memory is enabled.
  nudge_interval: 10        # Nudge every 10 user turns (0 = disabled)

  # Memory flush: give the agent one turn to save memories before context is
  # lost (compression, /new, /reset, exit). Set to 0 to disable.
  # For exit/reset, only fires if the session had at least this many user turns.
  flush_min_turns: 6        # Min user turns to trigger flush on exit/reset (0 = disabled)

# =============================================================================
# Session Reset Policy (Messaging Platforms)
# =============================================================================
# Controls when messaging sessions (Telegram, Discord, WhatsApp, Slack) are
# automatically cleared. Without resets, conversation context grows indefinitely
# which increases API costs with every message.
#
# When a reset triggers, the agent first saves important information to its
# persistent memory — but the conversation context is wiped. The agent starts
# fresh but retains learned facts via its memory system.
#
# Users can always manually reset with /reset or /new in chat.
#
# Modes:
#   "both"  - Reset on EITHER inactivity timeout or daily boundary (recommended)
#   "idle"  - Reset only after N minutes of inactivity
#   "daily" - Reset only at a fixed hour each day
#   "none"  - Never auto-reset; context lives until /reset or compression kicks in
#
# When a reset triggers, the agent gets one turn to save important memories and
# skills before the context is wiped. Persistent memory carries across sessions.
#
session_reset:
  mode: both           # "both", "idle", "daily", or "none"
  idle_minutes: 1440   # Inactivity timeout in minutes (default: 1440 = 24 hours)
  at_hour: 4           # Daily reset hour, 0-23 local time (default: 4 AM)

# When true, group/channel chats use one session per participant when the platform
# provides a user ID. This is the secure default and prevents users in the same
# room from sharing context, interrupts, and token costs. Set false only if you
# explicitly want one shared "room brain" per group/channel.
group_sessions_per_user: true

# ─────────────────────────────────────────────────────────────────────────────
# Gateway Streaming
# ─────────────────────────────────────────────────────────────────────────────
# Stream tokens to messaging platforms in real-time. The bot sends a message
# on first token, then progressively edits it as more tokens arrive.
# Disabled by default — enable to try the streaming UX on Telegram/Discord/Slack.
# For Telegram, partial edits are sent as plain text and only the final edit uses MarkdownV2.
streaming:
  enabled: false
  # transport: edit           # "edit" = progressive editMessageText
  # edit_interval: 0.3        # seconds between message edits
  # buffer_threshold: 40      # chars before forcing an edit flush
  # cursor: " ▉"              # cursor shown during streaming

# =============================================================================
# Skills Configuration
# =============================================================================
# Skills are reusable procedures the agent can load and follow. The agent can
# also create new skills after completing complex tasks.
#
skills:
  # Nudge the agent to create skills after complex tasks.
  # Every N tool-calling iterations, remind the model to consider saving a skill.
  # Set to 0 to disable.
  creation_nudge_interval: 15

  # External skill directories — share skills across tools/agents without
  # copying them into ~/.hermes/skills/.  Each path is expanded (~ and ${VAR})
  # and resolved to an absolute path.  External dirs are read-only: skill
  # creation always writes to ~/.hermes/skills/.  Local skills take precedence
  # when names collide.
  # external_dirs:
  #   - ~/.agents/skills
  #   - /home/shared/team-skills

# =============================================================================
# Agent Behavior
```

**File:** cli-config.yaml.example (L562-614)
```text
agent:
  # Maximum tool-calling iterations per conversation
  # Higher = more room for complex tasks, but costs more tokens
  # Recommended: 20-30 for focused tasks, 50-100 for open exploration
  max_turns: 60

  # Inactivity timeout for gateway agent runs (seconds, 0 = unlimited).
  # The agent can run indefinitely when actively calling tools or receiving
  # API responses.  Only fires after the agent has been idle for this duration.
  # gateway_timeout: 1800

  # Staged warning: send a warning before escalating to full timeout.
  # Fires once per run when inactivity reaches this threshold (seconds).
  # Set to 0 to disable the warning.
  # gateway_timeout_warning: 900

  # Graceful drain timeout for gateway stop/restart (seconds).
  # The gateway stops accepting new work, waits for in-flight agents to
  # finish, then interrupts anything still running after this timeout.
  # 0 = no drain, interrupt immediately.
  # restart_drain_timeout: 60

  # Max app-level retry attempts for API errors (connection drops, provider
  # timeouts, 5xx, etc.) before the agent surfaces the failure. Lower this
  # to 1 if you use fallback providers and want fast failover on flaky
  # primaries (default 3). The OpenAI SDK does its own low-level retries
  # underneath this wrapper — this is the Hermes-level loop.
  # api_max_retries: 3
  
  # Enable verbose logging
  verbose: false
  
  # Reasoning effort level (OpenRouter and Nous Portal)
  # Controls how much "thinking" the model does before responding.
  # Options: "xhigh" (max), "high", "medium", "low", "minimal", "none" (disable)
  reasoning_effort: "medium"
  
  # Predefined personalities (use with /personality command)
  personalities:
    helpful: "You are a helpful, friendly AI assistant."
    concise: "You are a concise assistant. Keep responses brief and to the point."
    technical: "You are a technical expert. Provide detailed, accurate technical information."
    creative: "You are a creative assistant. Think outside the box and offer innovative solutions."
    teacher: "You are a patient teacher. Explain concepts clearly with examples."
    kawaii: "You are a kawaii assistant! Use cute expressions like (◕‿◕), ★, ♪, and ~! Add sparkles and be super enthusiastic about everything! Every response should feel warm and adorable desu~! ヽ(>∀<☆)ノ"
    catgirl: "You are Neko-chan, an anime catgirl AI assistant, nya~! Add 'nya' and cat-like expressions to your speech. Use kaomoji like (=^･ω･^=) and ฅ^•ﻌ•^ฅ. Be playful and curious like a cat, nya~!"
    pirate: "Arrr! Ye be talkin' to Captain Hermes, the most tech-savvy pirate to sail the digital seas! Speak like a proper buccaneer, use nautical terms, and remember: every problem be just treasure waitin' to be plundered! Yo ho ho!"
    shakespeare: "Hark! Thou speakest with an assistant most versed in the bardic arts. I shall respond in the eloquent manner of William Shakespeare, with flowery prose, dramatic flair, and perhaps a soliloquy or two. What light through yonder terminal breaks?"
    surfer: "Duuude! You're chatting with the chillest AI on the web, bro! Everything's gonna be totally rad. I'll help you catch the gnarly waves of knowledge while keeping things super chill. Cowabunga! 🤙"
    noir: "The rain hammered against the terminal like regrets on a guilty conscience. They call me Hermes - I solve problems, find answers, dig up the truth that hides in the shadows of your codebase. In this city of silicon and secrets, everyone's got something to hide. What's your story, pal?"
    uwu: "hewwo! i'm your fwiendwy assistant uwu~ i wiww twy my best to hewp you! *nuzzles your code* OwO what's this? wet me take a wook! i pwomise to be vewy hewpful >w<"
    philosopher: "Greetings, seeker of wisdom. I am an assistant who contemplates the deeper meaning behind every query. Let us examine not just the 'how' but the 'why' of your questions. Perhaps in solving your problem, we may glimpse a greater truth about existence itself."
    hype: "YOOO LET'S GOOOO!!! 🔥🔥🔥 I am SO PUMPED to help you today! Every question is AMAZING and we're gonna CRUSH IT together! This is gonna be LEGENDARY! ARE YOU READY?! LET'S DO THIS! 💪😤🚀"
```

**File:** cli-config.yaml.example (L871-888)
```text
delegation:
  max_iterations: 50                          # Max tool-calling turns per child (default: 50)
  # max_concurrent_children: 3                # Max parallel child agents per batch (default: 3, floor: 1, no ceiling).
                                              # WARNING: values above 10 multiply API cost linearly.
  # max_spawn_depth: 1                        # Delegation tree depth cap (range: 1-3, default: 1 = flat).
                                              # Raise to 2 to allow workers to spawn their own subagents.
                                              # Requires role="orchestrator" on intermediate agents.
  # orchestrator_enabled: true                # Kill switch for role="orchestrator" children (default: true).
  # subagent_auto_approve: false              # When a subagent hits a dangerous-command approval prompt, auto-deny (default: false)
                                              # or auto-approve "once" (true) instead of blocking on stdin.
                                              # The parent TUI owns stdin, so blocking would deadlock; non-interactive resolution is required.
                                              # Both choices emit a logger.warning audit line. Flip to true only for cron/batch pipelines.
  # inherit_mcp_toolsets: true                # When explicit child toolsets are narrowed, also keep the parent's MCP toolsets (default: true). Set false for strict intersection.
  # model: "google/gemini-3-flash-preview"    # Override model for subagents (empty = inherit parent)
  # provider: "openrouter"                    # Override provider for subagents (empty = inherit parent)
  #                                           # Resolves full credentials (base_url, api_key) automatically.
  #                                           # Supported: openrouter, nous, zai, kimi-coding, minimax

```

**File:** cli-config.yaml.example (L1087-1100)
```text
# hooks:
#   pre_tool_call:
#     - matcher: "terminal"
#       command: "~/.hermes/agent-hooks/block-rm-rf.sh"
#       timeout: 10
#   post_tool_call:
#     - matcher: "write_file|patch"
#       command: "~/.hermes/agent-hooks/auto-format.sh"
#   pre_llm_call:
#     - command: "~/.hermes/agent-hooks/inject-cwd-context.sh"
#   subagent_stop:
#     - command: "~/.hermes/agent-hooks/log-orchestration.sh"
#
# hooks_auto_accept: false
```

**File:** agent/agent_runtime_helpers.py (L338-367)
```python
def repair_message_sequence(agent, messages: List[Dict]) -> int:
    """Collapse malformed role-alternation left in the live history.

    Providers (OpenAI, OpenRouter, Anthropic) expect strict alternation:
    after the system message, user/tool alternates with assistant, with
    no two consecutive user messages and no tool-result that doesn't
    follow an assistant-with-tool_calls. Violations cause silent empty
    responses on most providers, which triggers the empty-retry loop.

    This runs right before the API call as a defensive belt — by the
    time it fires, the scaffolding strip should already have prevented
    most shapes, but external callers (gateway multi-queue replay,
    session resume, cron, explicit conversation_history passed in by
    host code) can feed in already-broken histories.

    Repairs applied:
      1. Stray ``tool`` messages whose ``tool_call_id`` doesn't match
         any preceding assistant tool_call — dropped.
      2. Consecutive ``user`` messages — merged with newline separator
         so no user input is lost.

    Deliberately does NOT rewind orphan ``assistant(tool_calls)+tool``
    pairs that precede a user message — that pattern IS valid when the
    previous turn completed normally and the user jumped in to redirect
    before the model got a continuation turn (the ongoing dialog
    pattern). The empty-response scaffolding stripper handles the
    genuinely-broken variant via its flag-gated rewind.

    Returns the number of repairs made (for logging/telemetry).
    """
```

**File:** agent/context_compressor.py (L1239-1296)
```python
    def _sanitize_tool_pairs(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Fix orphaned tool_call / tool_result pairs after compression.

        Two failure modes:
        1. A tool *result* references a call_id whose assistant tool_call was
           removed (summarized/truncated).  The API rejects this with
           "No tool call found for function call output with call_id ...".
        2. An assistant message has tool_calls whose results were dropped.
           The API rejects this because every tool_call must be followed by
           a tool result with the matching call_id.

        This method removes orphaned results and inserts stub results for
        orphaned calls so the message list is always well-formed.
        """
        surviving_call_ids: set = set()
        for msg in messages:
            if msg.get("role") == "assistant":
                for tc in msg.get("tool_calls") or []:
                    cid = self._get_tool_call_id(tc)
                    if cid:
                        surviving_call_ids.add(cid)

        result_call_ids: set = set()
        for msg in messages:
            if msg.get("role") == "tool":
                cid = msg.get("tool_call_id")
                if cid:
                    result_call_ids.add(cid)

        # 1. Remove tool results whose call_id has no matching assistant tool_call
        orphaned_results = result_call_ids - surviving_call_ids
        if orphaned_results:
            messages = [
                m for m in messages
                if not (m.get("role") == "tool" and m.get("tool_call_id") in orphaned_results)
            ]
            if not self.quiet_mode:
                logger.info("Compression sanitizer: removed %d orphaned tool result(s)", len(orphaned_results))

        # 2. Add stub results for assistant tool_calls whose results were dropped
        missing_results = surviving_call_ids - result_call_ids
        if missing_results:
            patched: List[Dict[str, Any]] = []
            for msg in messages:
                patched.append(msg)
                if msg.get("role") == "assistant":
                    for tc in msg.get("tool_calls") or []:
                        cid = self._get_tool_call_id(tc)
                        if cid in missing_results:
                            patched.append({
                                "role": "tool",
                                "content": "[Result from earlier conversation — see context summary above]",
                                "tool_call_id": cid,
                            })
            messages = patched
            if not self.quiet_mode:
                logger.info("Compression sanitizer: added %d stub tool result(s)", len(missing_results))

```

**File:** website/docs/developer-guide/tools-runtime.md (L153-161)
```markdown
### Error wrapping

All tool execution is wrapped in error handling at two levels:

1. **`registry.dispatch()`** — catches any exception from the handler and returns `{"error": "Tool execution failed: ExceptionType: message"}` as JSON.

2. **`handle_function_call()`** — wraps the entire dispatch in a secondary try/except that returns `{"error": "Error executing tool_name: message"}`.

This ensures the model always receives a well-formed JSON string, never an unhandled exception.
```

**File:** website/docs/developer-guide/tools-runtime.md (L163-172)
```markdown
### Agent-loop tools

Four tools are intercepted before registry dispatch because they need agent-level state (TodoStore, MemoryStore, etc.):

- `todo` — planning/task tracking
- `memory` — persistent memory writes
- `session_search` — cross-session recall
- `delegate_task` — spawns subagent sessions

These tools' schemas are still registered in the registry (for `get_tool_definitions`), but their handlers return a stub error if dispatch somehow reaches them directly.
```

**File:** CONTRIBUTING.md (L243-244)
```markdown
- **Ephemeral injection**: System prompts and prefill messages are injected at API call time, never persisted to the database or logs.
- **Provider abstraction**: The agent works with any OpenAI-compatible API. Provider resolution happens at init time (Nous Portal OAuth, OpenRouter API key, or custom endpoint).
```

**File:** website/docs/user-guide/configuration.md (L45-56)
```markdown
## Configuration Precedence

Settings are resolved in this order (highest priority first):

1. **CLI arguments** — e.g., `hermes chat --model anthropic/claude-sonnet-4` (per-invocation override)
2. **`~/.hermes/config.yaml`** — the primary config file for all non-secret settings
3. **`~/.hermes/.env`** — fallback for env vars; **required** for secrets (API keys, tokens, passwords)
4. **Built-in defaults** — hardcoded safe defaults when nothing else is set

:::info Rule of Thumb
Secrets (API keys, bot tokens, passwords) go in `.env`. Everything else (model, terminal backend, compression settings, memory limits, toolsets) goes in `config.yaml`. When both are set, `config.yaml` wins for non-secret settings.
:::
```

**File:** website/docs/user-guide/configuration.md (L629-631)
```markdown
:::tip Gateway hot-reload of compression and context length
As of recent releases, editing `model.context_length` or any `compression.*` key in `config.yaml` on a running gateway takes effect on the next message — no gateway restart, no `/reset`, no session rotation required. The cached-agent signature includes these keys, so the gateway transparently rebuilds the agent when it sees a change. API keys and tool/skill config still require the usual reload paths.
:::
```

**File:** website/docs/user-guide/configuration.md (L846-906)
```markdown
### Full auxiliary config reference

```yaml
auxiliary:
  # Image analysis (vision_analyze tool + browser screenshots)
  vision:
    provider: "auto"           # "auto", "openrouter", "nous", "codex", "main", etc.
    model: ""                  # e.g. "openai/gpt-4o", "google/gemini-2.5-flash"
    base_url: ""               # Custom OpenAI-compatible endpoint (overrides provider)
    api_key: ""                # API key for base_url (falls back to OPENAI_API_KEY)
    timeout: 120               # seconds — LLM API call timeout; vision payloads need generous timeout
    download_timeout: 30       # seconds — image HTTP download; increase for slow connections

  # Web page summarization + browser page text extraction
  web_extract:
    provider: "auto"
    model: ""                  # e.g. "google/gemini-2.5-flash"
    base_url: ""
    api_key: ""
    timeout: 360               # seconds (6min) — per-attempt LLM summarization

  # Dangerous command approval classifier
  approval:
    provider: "auto"
    model: ""
    base_url: ""
    api_key: ""
    timeout: 30                # seconds

  # Context compression timeout (separate from compression.* config)
  compression:
    timeout: 120               # seconds — compression summarizes long conversations, needs more time

  # Skills hub — skill matching and search
  skills_hub:
    provider: "auto"
    model: ""
    base_url: ""
    api_key: ""
    timeout: 30

  # MCP tool dispatch
  mcp:
    provider: "auto"
    model: ""
    base_url: ""
    api_key: ""
    timeout: 30

  # Kanban triage specifier — `hermes kanban specify <id>` (or the
  # dashboard's ✨ Specify button on Triage-column cards) uses this
  # slot to expand a one-liner into a concrete spec and promote the
  # task to `todo`. Cheap fast models work well here; spec expansion
  # is short and doesn't need reasoning depth.
  triage_specifier:
    provider: "auto"
    model: ""
    base_url: ""
    api_key: ""
    timeout: 120
```
```

**File:** website/docs/reference/cli-commands.md (L19-34)
```markdown
### Global options

| Option | Description |
|--------|-------------|
| `--version`, `-V` | Show version and exit. |
| `--profile <name>`, `-p <name>` | Select which Hermes profile to use for this invocation. Overrides the sticky default set by `hermes profile use`. |
| `--resume <session>`, `-r <session>` | Resume a previous session by ID or title. |
| `--continue [name]`, `-c [name]` | Resume the most recent session, or the most recent session matching a title. |
| `--worktree`, `-w` | Start in an isolated git worktree for parallel-agent workflows. |
| `--yolo` | Bypass dangerous-command approval prompts. |
| `--pass-session-id` | Include the session ID in the agent's system prompt. |
| `--ignore-user-config` | Ignore `~/.hermes/config.yaml` and fall back to built-in defaults. Credentials in `.env` are still loaded. |
| `--ignore-rules` | Skip auto-injection of `AGENTS.md`, `SOUL.md`, `.cursorrules`, memory, and preloaded skills. |
| `--tui` | Launch the [TUI](../user-guide/tui.md) instead of the classic CLI. Equivalent to `HERMES_TUI=1`. |
| `--dev` | With `--tui`: run the TypeScript sources directly via `tsx` instead of the prebuilt bundle (for TUI contributors). |

```

**File:** website/docs/reference/cli-commands.md (L36-82)
```markdown

| Command | Purpose |
|---------|---------|
| `hermes chat` | Interactive or one-shot chat with the agent. |
| `hermes model` | Interactively choose the default provider and model. |
| `hermes fallback` | Manage fallback providers tried when the primary model errors. |
| `hermes gateway` | Run or manage the messaging gateway service. |
| `hermes proxy` | Local OpenAI-compatible proxy that attaches OAuth provider credentials. See [Subscription Proxy](../user-guide/features/subscription-proxy.md). |
| `hermes lsp` | Manage Language Server Protocol integration (semantic diagnostics for write_file/patch). |
| `hermes setup` | Interactive setup wizard for all or part of the configuration. |
| `hermes whatsapp` | Configure and pair the WhatsApp bridge. |
| `hermes slack` | Slack helpers (currently: generate the app manifest with every command as a native slash). |
| `hermes auth` | Manage credentials — add, list, remove, reset, set strategy. Handles OAuth flows for Codex/Nous/Anthropic. |
| `hermes login` / `logout` | **Deprecated** — use `hermes auth` instead. |
| `hermes status` | Show agent, auth, and platform status. |
| `hermes cron` | Inspect and tick the cron scheduler. |
| `hermes kanban` | Multi-profile collaboration board (tasks, links, dispatcher). |
| `hermes webhook` | Manage dynamic webhook subscriptions for event-driven activation. |
| `hermes hooks` | Inspect, approve, or remove shell-script hooks declared in `config.yaml`. |
| `hermes doctor` | Diagnose config and dependency issues. |
| `hermes dump` | Copy-pasteable setup summary for support/debugging. |
| `hermes debug` | Debug tools — upload logs and system info for support. |
| `hermes backup` | Back up Hermes home directory to a zip file. |
| `hermes checkpoints` | Inspect / prune / clear `~/.hermes/checkpoints/` (the shadow store used by `/rollback`). Run with no args for a status overview. |
| `hermes import` | Restore a Hermes backup from a zip file. |
| `hermes logs` | View, tail, and filter agent/gateway/error log files. |
| `hermes config` | Show, edit, migrate, and query configuration files. |
| `hermes pairing` | Approve or revoke messaging pairing codes. |
| `hermes skills` | Browse, install, publish, audit, and configure skills. |
| `hermes bundles` | Group several skills under a single `/<name>` slash command. See [Skill Bundles](../user-guide/features/skills.md#skill-bundles). |
| `hermes curator` | Background skill maintenance — status, run, pause, pin. See [Curator](../user-guide/features/curator.md). |
| `hermes memory` | Configure external memory provider. Plugin-specific subcommands (e.g. `hermes honcho`) register automatically when their provider is active. |
| `hermes acp` | Run Hermes as an ACP server for editor integration. |
| `hermes mcp` | Manage MCP server configurations and run Hermes as an MCP server. |
| `hermes plugins` | Manage Hermes Agent plugins (install, enable, disable, remove). |
| `hermes portal` | Nous Portal status, subscription link, and Tool Gateway routing. See [Tool Gateway](../user-guide/features/tool-gateway.md). |
| `hermes tools` | Configure enabled tools per platform. |
| `hermes computer-use` | Install or check the cua-driver backend (macOS Computer Use). |
| `hermes sessions` | Browse, export, prune, rename, and delete sessions. |
| `hermes insights` | Show token/cost/activity analytics. |
| `hermes claw` | OpenClaw migration helpers. |
| `hermes dashboard` | Launch the web dashboard for managing config, API keys, and sessions. |
| `hermes profile` | Manage profiles — multiple isolated Hermes instances. |
| `hermes completion` | Print shell completion scripts (bash/zsh/fish). |
| `hermes version` | Show version information. |
| `hermes update` | Pull latest code and reinstall dependencies (git installs), or check PyPI and `pip install --upgrade` (pip installs). `--check` previews without installing; `--backup` takes a pre-pull `HERMES_HOME` snapshot. |
| `hermes uninstall` | Remove Hermes from the system. |
```
