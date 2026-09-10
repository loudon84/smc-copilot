---
name: Work 供应商模型同步 config.yaml 与会话 override 生效
overview: 让 Providers 页添加的模型与默认模型都写入 config.yaml（custom_providers + model.default），并保证会话里选择的自定义模型真正路由到对应 provider+baseUrl，而不是回落到全局默认。
todos:
  - id: a1
    content: "agent-config-providers: upsertAgentCustomProviderModel 写 custom_providers"
    status: completed
  - id: a2
    content: register.ts add-model/remove-model 本地分支接入同步
    status: completed
  - id: b1
    content: 默认模型写 config.yaml 回归测试
    status: completed
  - id: c1
    content: dashboard slug 解析命中命名 provider
    status: completed
  - id: c2
    content: legacy 路径 override provider/baseUrl 上 wire（先查网关契约）
    status: completed
  - id: d1
    content: 补测试 + lat.md 更新 + lat check/tsc/vitest
    status: completed
isProject: false
---

## 背景与根因

会话（聊天）模型选择器严格只读 `config.yaml`（`model.default` + `custom_providers:`），见 [apps/work/src/main/models.ts](apps/work/src/main/models.ts) `listConfiguredAgentModels` / `loadCustomProviders`。但桌面 UI 存在两个断点：

1. **加模型只写 `models.json`**：[apps/work/src/main/models.ts](apps/work/src/main/models.ts) `addModel` 只写 `models.json`；供应商身份经 `upsertCustomProvider` 只镜像到 `config.yaml` 的 `providers:` 字典（[apps/work/src/main/agent-config-providers.ts](apps/work/src/main/agent-config-providers.ts) `upsertAgentUserProvider`，仅 name/base_url/key_env，无 model id）。`custom_providers:` 列表没有任何 UI 写入路径 → 选择器只剩「默认模型」。
2. **会话 override 不上 wire**：dashboard 路径靠 `/model` slash + `prompt.submit`（submit 不带 model）；legacy `/v1` 路径 HTTP body 只放 `model` 字段（[apps/work/src/main/hermes.ts](apps/work/src/main/hermes.ts) ~646、~1037），`provider`/`baseUrl` 被丢弃 → 网关回落到 `config.yaml` 的 `model.default`（deepseek-v4-pro + 官方地址）。

## 改动

### A. 加模型时同步写 `config.yaml` 的 `custom_providers:`

新增 [apps/work/src/main/agent-config-providers.ts](apps/work/src/main/agent-config-providers.ts) 的写函数 `upsertAgentCustomProviderModel(profile, { name, baseUrl, keyEnv, model, apiMode? })`：
- 在 `custom_providers:` 列表中按 `name`+规范化 `baseUrl` 匹配已有条目；无则追加 `- name:/base_url:/key_env:` 条目。
- 把 `model` 写进该条目：首个模型写 `model:` 字段，后续模型写进嵌套 `models:` 映射（与 `loadCustomProviders` 的读取格式完全对齐，见 models.ts:266-353）。
- 文本级 splice（沿用 `findProvidersBlock`/`renderEntry` 的偏移风格），保留用户注释与其它字段；幂等（重复添加同一模型为 no-op）。

在 [apps/work/src/main/ipc/register.ts](apps/work/src/main/ipc/register.ts) `add-model` 的**本地分支**（~2620）中，`addModel(...)` 之后追加调用上述函数（仅当 `provider === "custom"` 且有 `baseUrl`；用 `providerLabel ?? host` 作为条目名）。remote/SSH 分支不动。

`removeModel` 对应在 `remove-model` 本地分支把该模型从 `custom_providers:` 条目移除（空条目保留 name/base_url/key_env，避免丢供应商身份——身份由 `providers:` 字典持有）。

### B. 设默认模型已写 `config.yaml`（确认 + 回归测试）

`setModelConfig`（[apps/work/src/main/config.ts](apps/work/src/main/config.ts):960）已写 `model.provider/default/base_url`。Providers 页「Change」弹窗的 `confirmModelPick` 已调用它。仅需补一个回归测试锁定「Providers 页确认模型 → config.yaml model.default 被写入」，并确认 custom 供应商的 `base_url` 一并写入（现有逻辑已处理）。

### C. 会话 override 真正生效

- Dashboard 路径：确认 `resolveDashboardProviderForModel`（[apps/work/src/renderer/src/screens/Chat/hooks/useDashboardChatTransport.ts](apps/work/src/renderer/src/screens/Chat/hooks/useDashboardChatTransport.ts):500）对 `custom` + `llm.superic.com:3900/v1` 能解析到 config.yaml `providers:` 里被 A 写入模型后的命名 slug（hermesone 镜像或自定义 slug），使 `/model <id> --provider <slug>` 命中正确端点。A 落地后 `model.options` 的 provider 行会带上这些模型，`modelIsListedByProvider` 命中，slug 解析不再落空。
- Legacy 路径：在 [apps/work/src/main/hermes.ts](apps/work/src/main/hermes.ts) 两处 body 构造里，当 override 提供 `provider`/`baseUrl` 时一并放入请求体（`provider`、`base_url` 字段），让网关按请求级路由而非 `model.default`。需先核对网关 `/v1/chat/completions` 与 `/v1/runs` 是否接受这些字段；若网关不支持，则改为在发送前对网关执行 model 设置调用（与 dashboard 的 `/model` 等价）。

### D. 测试

- `tests/models-configured-agent.test.ts`：UI 加模型后 `listConfiguredAgentModels` 能列出该模型（端到端：addModel → custom_providers → picker 源）。
- `agent-config-providers.test.ts`：`upsertAgentCustomProviderModel` 的追加/幂等/嵌套 models 映射。
- `providers-store.test.ts` / `set-model-config-base-url.test.ts`：默认模型写入回归。
- dashboard-chat-transport 测试：custom + 企业 URL 的 slug 解析命中命名 provider。

### E. 收尾

更新 `lat.md/model-selection.md`、`lat.md/provider-setup.md`（双向同步语义），跑 `lat check`、相关 vitest、`tsc --noEmit`。

## 待确认

C 的 legacy 路径取决于网关是否接受请求级 `provider`/`base_url` 字段 —— 实现前我会先查 `services/runtime` / hermes-agent 的 `/v1/chat/completions` 契约；若不支持则走「发送前先 set model」方案。这一点不影响 A/B 先行。