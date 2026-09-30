---
title: "smc-copilot 0.7.10 Release npm test Gate Hotfix"
subtitle: "正式发版脚本在 npm test 停止；按根因修测试门，不跳过门禁"
prd_id: "PRD-WORK-RELEASE-NPM-TEST-GATE-HOTFIX-V0.7.10"
version: "0.7.10"
status: "APPROVED_FOR_PLAN"
template_version: "需求PRD工程模板 v1.0"
product: "smc-copilot Desktop / apps/work"
repository: "loudon84/smc-copilot"
branch: "work/prd-v6.2.1"
baseline_commit: "580404ab"
owner: "Work Platform / Release"
reviewers: []
created_at: "2026-09-30"
updated_at: "2026-09-30"
target_release: "0.7.10"
change_type: ["HOTFIX", "BROWNFIELD_CHANGE"]
evidence_log: "0.7.10 build-work-release.ps1 npm test, 2026-09-30 14:01"
related_docs:
  - "apps/work/scripts/build-work-release.ps1"
  - "docs/engineering/prd-template.md"
supersedes: null
---

# 0. PRD 使用原则

本文件只覆盖 `apps/work/scripts/build-work-release.ps1` 在 **0.7.10** 正式打包时停在 `npm test` 的失败。它不改产品功能范围，不改 `electron-builder.yml`，也不允许从发版脚本里拿掉 `npm test`。

```text
status = APPROVED_FOR_PLAN
grilling = CLOSED 2026-09-30（HF-G-01～HF-G-16）
review = 2026-09-30 对照已关闭决定检查正文；纠正 §3.3 临时目录、R5 记忆库替身、R8 工具集断言、R9 合同锁与“改断言”后，用户要求转为可计划
```

可以据此写 Plan。Plan 待用户另行要求后再写。禁止跳过已批准 Plan 去改尚未落地的生产代码。`C:\tmp` 三处测试是 HF-G-03 已实施的部分。

## 0.1 现场命令与结果

2026-09-30，在 `apps/work` 用正式入口打包未签名 0.7.10：

```text
SMC_WORK_RELEASE_ALLOW_UNSIGNED=1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-work-release.ps1
```

基线提交 `580404ab`（测试固定英文源语言，并把新增英文键译入 zh-CN）。该提交已经消除上一轮「断言英文、界面中文」的失败。

脚本走到并停下的步骤：

```text
Load apps/work/.env          通过（写入 7 个进程环境变量）
Check git state              通过
Validate update URL          通过
Generate build identity      通过
Prepare Registry / Knowledge 通过
Stage Hermes bootstrap       通过
npm ci                       通过
npm run guard                通过
npm run typecheck            通过
npm test                     失败，脚本抛出 npm test failed
Compile / NSIS               未执行
```

Vitest 汇总：

```text
Test Files  35 failed | 328 passed | 1 skipped (364)
Tests       103 failed | 2834 passed | 13 skipped (2950)
Failed Suites  1（hermes-account.test.ts 整文件 0 test）
```

没有生成 `smc-copilot-0.7.10-setup.exe`。

本机事实，用于解释若干失败：没有 `E:` 盘；`apps/work/.env` 含 `SMC_KNOWLEDGE_SERVICE_URL` 与 `SMC_WORK_SKILL_RUN_MODE`，发版脚本在 `npm test` 之前把它们写进当前进程。

## 0.2 禁止项

- 禁止删除或跳过 `build-work-release.ps1` 里的 `npm test`。
- 禁止改 `electron-builder.yml` 的 files / extraResources。
- 禁止为了变绿而放宽 skill-run 合同锁、IPC 清单、预加载类型清单的校验标准。那些失败要修到清单与源码一致，而不是关掉断言。
- 禁止把临时目录写成只在某一块盘存在时才能跑。用户已指定测试临时根为 `C:\tmp`：目录不存在则创建。
- 禁止修改或删除 `apps/work/.env` 里的变量值。测试进程只在内存里不看见这些键。

## 0.3 已确认

设计树已关闭，见 §0.4。2026-09-30 用户要求在正文与这些决定一致后转为 `APPROVED_FOR_PLAN`。

## 0.4 已关闭的决定

2026-09-30 用户确认：

| ID | 决定 |
|---|---|
| HF-G-01 | 生成文件名跟现有测试走。非法字符就地换成 `-`，最长 80。只去掉盘符前缀和 UNC，不再按 `/` `\` 丢掉标题前半段。 |
| HF-G-02 | `npm test` 不能看见发版烘焙变量。具体范围以 HF-G-16 为准。烘焙步骤仍读 `.env`。 |
| HF-G-03 | 测试临时根是 `C:\tmp`。目录不存在则创建。telemetry、feature-mode、token-store 已落地。 |
| HF-G-04 | Electron：生产读取在缺 `app` 或 `getPath` 失败时得到空 userData；测试替身同时补上 `app`。真实 `app.getPath("userData")` 的结果不变。不改账户文件和钱包加密。 |
| HF-G-05 | Skill Run 落会话保持失败闭合。修测试库使绑定能写入。绑定真正写失败时生产路径继续失败，不把消息报成已落库。 |
| HF-G-06 | 记忆库只改测试替身，让 `better-sqlite3` 假构造带上 `close`。生产 `openSqliteDatabase` 只在原生模块真正加载失败时 fallback，不把“没有 `close`”当成加载失败。 |
| HF-G-07 | 知识库页面测试只补夹具：`desktopAuth.getState` / `onStateChanged`，以及 `hermesAPI.onConnectionConfigChanged`。`Chat` 在真实窗口里的调用不改成缺失则跳过。 |
| HF-G-08 | 知识库锁和 skill-run bundle 锁仍是发布合同。不改期望哈希去迎合当前文件。内容若与锁不符，先对齐代码和夹具，不重写锁。 |
| HF-G-09 | `materialize-chat-session-turn` 从 preload 与旧 IPC 清单里一起删除。不在主进程补回这个 handler。 |
| HF-G-10 | Hermes CLI 文件不存在时状态是 `runtime_invalid`，不是 `gateway_unreachable`。 |
| HF-G-11 | 每一个 preload 在调、主进程没有注册的通道，都从 preload 和 IPC 清单里一起删除。不在主进程补回已经不存在的 handler，也不关掉清单测试。 |
| HF-G-12 | 源码字符串检索改到现行所有者。doctor 仍不是拼进 shell 的命令字符串，sudo 预缓存仍接线。不把实现搬回旧文件去迎合检索路径。 |
| HF-G-13 | `file-store` 比较规范化之后的同一路径。生产不改为返回 8.3 短路径。 |
| HF-G-14 | 其余失败断言仍是合同：工具集 YAML、SSH 引号、删除会话清附件、skill delta 与 CRLF Result、主题按 appearance、preload 补类型不删方法、本地 publish 暂存不得声称生产成功、OpenClaw/技能目录与远程会话/cron、以及 profile 在 CLI 已保存选择时不改文件。只改实现或夹具，不放宽断言。 |
| HF-G-15 | 删除半边 IPC 通道时，preload、类型声明、IPC 清单和渲染进程调用同一批去掉。没有主进程 handler 的方法不再留在界面上。 |
| HF-G-16 | 启动 `npm test` 的子进程清掉 `apps/work/.env` 注入的全部键，包括 `SMC_KNOWLEDGE_SERVICE_URL`、`SMC_WORK_SKILL_RUN_MODE`、`VITE_ANALYTICS_BASE_URL`、`VITE_ANALYTICS_API_KEY`、`MAIN_VITE_HERMES_API_URL`、`MAIN_VITE_HERMES_API_KEY`。更早的烘焙步骤仍读这些值。禁止修改或删除 `apps/work/.env` 文件里的变量值。 |

# 1. 失败清单

103 条失败测试加 1 个无法收集用例的套件。下面按文件列出全部失败用例。

## 1.1 套件无法启动（不计入 103）

| 文件 | 失败 |
|---|---|
| `src/main/hermes-account.test.ts` | 整文件 0 test。`electron` 替身没有 `app`，加载 `hermes-runtime-config.ts` 的 `app?.getPath?.("userData")` 时 Vitest 抛出缺少导出。 |

## 1.2 103 条失败测试

| 文件 | 失败数 | 用例 |
|---|---:|---|
| `src/main/skill-run/skill-run-e2e.test.ts` | 1 | delivers CRLF runtime activity, exact deltas, and authoritative Result text |
| `src/main/skill-run/skill-run-consumer-lock.test.ts` | 6 | checksum-valid v1.2.1 / v1.3.0 / v1.4.0 Provider Bundle；P0 paths free of approval-decision schemas；v1.5.0 streaming-delta published shape；rejects tamper, CRLF, shape, fixture and wrong version |
| `tests/sessions-delete-session.test.ts` | 2 | clears staged attachment files for the deleted session；clears staged attachment files for every deleted id |
| `src/main/skill-run/skill-run-service.test.ts` | 1 | projects the first eligible delta into text before the snapshot arrives |
| `tests/remote-sessions.test.ts` | 1 | returns remote sessions in the cached-session shape used by the Sessions tab |
| `tests/installer-utils.test.ts` | 8 | OAuth credential_pool；token fields required；auth.json missing or malformed；empty `.openclaw`；populated `.openclaw`；nested files；not-found；legacy `.clawdbot` / `.moldbot` |
| `tests/remote-mode-url-and-spawn.test.ts` | 2 | cron port fallback after successful `/health`；no cron request to that port when `/health` fails |
| `tests/profiles.test.ts` | 1 | leaves the file alone when the CLI already persisted the selection |
| `tests/ssh-remote.test.ts` | 4 | multi-word title；multiline markdown body；single quote in user input；existing extraShell redirects |
| `tests/knowledge-page-host.test.ts` | 1 | switches across five Knowledge pages without a Profile or Uploads slot |
| `tests/knowledge-fail-closed.test.ts` | 4 | five Stage pages；unavailable/empty copy；Knowledge Chat not sendable；Mock/Demo badge stays visible |
| `tests/electron-security.test.ts` | 2 | hermes doctor without a shell-built command string；Linux sudo precache still wired |
| `tests/toolset-toggle.test.ts` | 12 | 写入/读回 `platform_toolsets.cli` 与 messaging 小节的全部 12 条（含缺省文件、缺 cli、已有 cli、空列表） |
| `tests/preload-api-surface.test.ts` | 1 | every preload method has a type declaration |
| `src/main/skill-run/skill-run-session-materialize.test.ts` | 4 | sessions/messages columns without created_at；later projection updates assistant；exact Prompt and title；promptSummary fallback |
| `tests/remote-history.test.ts` | 1 | sendMessage passes history to the best API transport in remote mode |
| `tests/ipc-handlers.test.ts` | 2 | every preload invoke has a matching main handler；materialize-chat-session-turn handler still registered |
| `src/main/wallet-store.test.ts` | 10 | 创建、导入、明文禁令、去重、上限、安全存储不可用、非法助记词、错误类型、改名、删除 |
| `tests/askpass-security.test.ts` | 1 | forwards answers with the gateway's exact respond shapes（源码须含 `"sudo.respond"`） |
| `tests/release-powershell-integration.test.ts` | 1 | publish-work-release.ps1 stages locally without claiming production success |
| `tests/knowledge-chat-page.test.ts` | 2 | mock 模式只经 facade 发送；provider 模式禁用输入且不引入 Work Chat Run |
| `src/main/account-store.test.ts` | 8 | 未登录为 null；会话往返；token 加解密；http→https；登出；跨主目录查找；全部登出；安全存储不可用 |
| `tests/memory-limits.test.ts` | 4 | readMemory 使用配置上限；具名 profile 的 config.yaml；写入到配置上限；更新条目时使用 profile 上限 |
| `src/main/skill-run/feature-mode-store.test.ts` | 8 | 默认 skill-first；env 回退 expert-compat / local-only；skill-only 别名；非法 env；读文件；持久化回退；只写模式文件 |
| `src/main/files/file-store.test.ts` | 2 | managed files layout under profileHome；objects/`<prefix>`/`<hash>` |
| `src/main/skill-run/skill-run-telemetry.test.ts` | 3 | allow-listed events；丢弃 prompt/arguments/JWT/URL/body/bytes；日志路径不可写时不抛 |
| `tests/hermes-availability-backend.test.ts` | 1 | reports runtime_invalid when Hermes CLI is absent |
| `tests/skills-content-security.test.ts` | 3 | default-profile installed skills；named-profile installed skills；bundled skills from hermes-agent repo |
| `tests/business-module-ui-surface.test.tsx` | 1 | maps Work appearance and writes 0 mutations to html（期望 `light`，得到 `dark`） |
| `src/main/files/agent-output/generated-file-name.test.ts` | 2 | strips Windows-illegal characters；truncates long titles to 80 chars |
| `src/main/remote-sessions.test.ts` | 1 | fails closed when Main cannot establish durable metadata |
| `tests/resolve-module-theme.test.ts` | 1 | maps Work theme ids by appearance, not by id === light |
| `src/main/knowledge/knowledge-contract-lock.test.ts` | 1 | pins tag, commit, and file checksums |
| `tests/work-knowledge-build-config.test.ts` | 1 | removes an old enterprise file when the env URL is unset |

合计 103。

# 2. 根因与修复方向

分组按“改一处能带走哪几条”。修复必须让发版进程里的 `npm test` 退出码为 0。本地另开一个不读 `.env` 的 `npm test` 也必须为 0，避免两套环境各绿一次。

## R1. Electron 局部替身没有 `app`（account-store 8 + wallet-store 10 + hermes-account 套件）

`hermes-runtime-config.ts` 的 `workRuntimeConfigPath()` 写成：

```ts
const userData = app?.getPath?.("userData");
```

Vitest 对 `vi.mock("electron")` 的缺失导出会在读取 `app` 时直接抛错，可选链接不住。`account-store.ts` 经 `hermes-runtime-paths.ts` 加载这段代码。`account-store.test.ts` 的替身只有 `safeStorage`。`wallet-store.test.ts` 同样只有 `safeStorage`。`hermes-account.test.ts` 的替身也没有可用的 `app.getPath`。

已按 HF-G-04 关闭：两边都做。缺导出或 `getPath` 失败时得到空字符串；触及这段路径的测试替身补上 `app.getPath`。真实 Electron 的 `app.getPath("userData")` 结果不变。不改账户文件格式，不改钱包加密。

## R2. 测试写死不存在的 `E:\tmp`（telemetry 3 + feature-mode 8）

`skill-run-telemetry.test.ts` 与 `feature-mode-store.test.ts` 把用户数据目录写成 `E:/tmp/...`。本机没有 `E:`，`mkdirSync` 得到 `ENOENT`，整组用例在断言之前失败。`token-store.test.ts` 也使用 `E:/tmp/...`，这一轮它没有出现在失败清单里。

用户决定（HF-G-03）：三处都改为 `C:\tmp` 下的子目录。用例开始前 `mkdirSync("C:/tmp", { recursive: true })`，目录不存在就创建。生产路径逻辑不改。已落地。

## R3. 发版进程把 `.env` 泄漏进 `npm test`（knowledge build config 1，并避免 feature-mode 在 R2 修好后误用 env）

`prepareKnowledgeBuildConfig` 的默认参数是：

```js
serviceUrl = process.env.SMC_KNOWLEDGE_SERVICE_URL
```

测试传入 `serviceUrl: undefined`。JavaScript 默认参数把 `undefined` 当成没传，于是在发版进程里读到 `.env` 里的地址，旧文件不会被删，`mode` 不是 `community`。不加载 `.env` 的本地 `npm test` 里这条可以通过。`SMC_WORK_SKILL_RUN_MODE` 同样进了测试进程；R2 修好之后，feature-mode 的“环境变量缺省”用例会看到这个值。

修复：`build-work-release.ps1` 在调用 `npm test` 的子进程里清掉从 `apps/work/.env` 注入的全部键。生成知识库配置和更新地址校验仍然在清除之前完成，它们继续看见 `.env`。禁止改写或删除 `apps/work/.env` 里的变量值。不改企业/社区烘焙本身的语义。

## R4. 生成文件名与现有测试合同不一致（generated-file-name 2）

`sanitizeGeneratedFileName` 先把 `\` 换成 `/` 再取最后一段，然后才替换剩余非法字符，最后 `slice(0, 180)`。

输入 `a<>:"/\\|?*b` 因此变成 `---b`，测试期望 `a---------b`。120 个 `x` 的长度是 120，测试期望 80。

已按 HF-G-01 关闭：跟测试合同改实现。非法字符就地替换，截断到 80，盘符和 UNC 前缀仍去掉。不要再 `split("/").pop()`。

## R5. node:sqlite 替身让 `db.close` 不是函数（memory-limits 4）

`memory.ts` 的 `getSessionStats` 在 `finally` 里调用 `db.close()`。`memory-limits.test.ts` 把 `better-sqlite3` 换成 `vi.fn()`。`openSqliteDatabase` 会 `new` 这个函数，得到没有 `close` 的对象，且这不是原生加载失败，所以不会落到 `node:sqlite` 包装。错误被吃掉后计数变成 0，配置上限断言失败（现场曾出现期望 3200/4096、得到默认值一类的数字偏差）。同一次运行里，真实 `better-sqlite3` 与 Electron ABI 不匹配时会打印 fallback 到 `node:sqlite`；远程会话测试也打了这行。

已按 HF-G-06 关闭：只改 `memory-limits` 的测试替身，让假构造带上 `close`。生产 `openSqliteDatabase` 仍只在原生模块真正加载失败时 fallback，不把“没有 `close`”当成加载失败。`getSessionStats` 的失败仍保持记日志并返回 0。记忆上限仍以 profile `config.yaml` 为准。

## R6. Skill Run 落会话时知识绑定写库失败（session-materialize 4）

四条用例的 stderr 都是：

```text
[skill-run] materialize transcript error; formal Work cache omitted
Error: KNOWLEDGE_BINDING_PERSIST_FAILED
  at upsertSessionMetadata (session-metadata-store.ts:300)
  at ensureSkillRunSessionMetadata (session-metadata-store.ts:452)
  at skill-run-session-materialize.ts:152
```

`upsertSessionMetadata` 在 INSERT 之后读回，发现行不存在或绑定不一致，就抛 `KNOWLEDGE_BINDING_PERSIST_FAILED`。实现把这次失败当成“正式 Work 缓存省略”，于是 `wroteMessages` 为 undefined、消息数组为空。测试要求消息写进替身数据库。

已按 HF-G-05 关闭：保持失败闭合。测试库必须能写入一条 skill-run 会话元数据。生产路径在绑定真正写失败时继续失败，不把消息报成已落库。

## R7. 知识库页面测试挂上了 Chat，而 Chat 假定主进程 API 存在（knowledge-chat 2 + knowledge-fail-closed 4 + knowledge-page-host 1）

`Chat.tsx` 在 effect 里无条件调用 `window.desktopAuth.getState()` 与 `window.hermesAPI.onConnectionConfigChanged`。这三组测试没有安装这两个函数，渲染抛 `Cannot read properties of undefined`。失败不是文案翻译。

已按 HF-G-07 关闭：测试夹具补上这两处最小替身（getState 返回未登录，onStateChanged / onConnectionConfigChanged 返回空的取消函数）。Chat 对已登录工作台的调用方式保持不变，不改成整段静默跳过。

## R8. 源码检索类测试仍在旧文件里找旧字符串（askpass 1 + electron-security 2）

`askpass-security.test.ts` 在 `hermes.ts` 全文里找 `"sudo.respond"`。`electron-security.test.ts` 按源码字符串检查 doctor 命令和 sudo 预缓存。这些字符串已经不在测试正在读的文件里。

已按 HF-G-12 关闭：检索改到现行所有者。doctor 仍不是拼接进 shell 的字符串，sudo 预缓存仍接线。不把实现搬回旧文件。`toolset-toggle` 的 12 条不在此项里，见 HF-G-14：断言保持 `platform_toolsets.cli` 且不冲掉兄弟键，改写入实现，不改期望。

## R9. 路径、主题、IPC、合同锁、远程会话（其余条目）

这些不能合成一个补丁，但必须在同一次门禁修复里各自对齐。现场观测：

| 簇 | 失败数 | 现场 | 修复方向 |
|---|---:|---|---|
| `file-store` | 2 | 期望 8.3 短路径 `ADMINI~1`，实际是长路径 `C:\Users\Administrator\...` | 比较规范化后的同一路径。本机 8.3 关闭时短路径不会出现。不要求生产改用短路径。 |
| `installer-utils` | 8 | Hermes 主目录 / `.openclaw` 探测相对路径与测试夹具不一致 | 探测仍以现有候选目录为准，测试夹具改到现行候选根。 |
| `skills-content-security` | 3 | 已安装技能与 hermes-agent 仓库根路径对不上 | 校验仍拒绝逃出技能目录；测试放入现行目录。 |
| `profiles` | 1 | CLI 已持久化选择时测试文件仍被改写 | 只读 CLI 结果，不再回写。 |
| `ssh-remote` | 4 | 引用与换行在命令引号里被吃掉 | 远端命令引号保持标题、正文、单引号和已有重定向。 |
| `remote-history` / `remote-mode-url-and-spawn` / 两个 `remote-sessions` | 1+2+1+1 | 历史未交给现行传输；cron 健康探测端口；会话失败闭合与缓存形状不对 | 按 HF-G-14 对齐实现或夹具。不改期望。失败闭合必须仍然失败闭合。 |
| `hermes-availability-backend` | 1 | CLI 缺失时期望 `runtime_invalid`，得到 `gateway_unreachable` | 按 HF-G-10：缺 CLI 时状态是 `runtime_invalid`。 |
| `ipc-handlers` | 2 | preload invoke 与 main handler 清单不一致；`materialize-chat-session-turn` 仍在 preload 侧 | 按 HF-G-11 与 HF-G-15：半边通道从 preload、类型、清单和渲染调用一起删除。不补回已不存在的 handler。 |
| `preload-api-surface` | 1 | preload 方法没有类型声明 | 仍保留的方法补类型。因 HF-G-15 删掉的方法连类型一起删，不单为过测试删仍在使用的方法。 |
| `business-module-ui-surface` / `resolve-module-theme` | 1+1 | 外观 `light` 被解析成 `dark` | 按 HF-G-14：按 appearance 解析，`id === "light"` 不再当条件。 |
| `knowledge-contract-lock` | 1 | tag / commit / 文件校验和与锁文件不符 | 按 HF-G-08：不重写锁，不改期望哈希。代码和夹具对齐锁上的发布合同。 |
| `skill-run-consumer-lock` | 6 | bundle 校验和或形状与锁不符 | 同知识库锁：不重写锁，不放宽门。 |
| `skill-run-e2e` | 1 | CRLF 活动流、精确 delta、权威 Result 文本对不上 | 保持 CRLF fixture 的权威 Result，修解析或修 fixture 的过期形状。 |
| `skill-run-service` | 1 | 第一条合格 delta 没有在快照前进入文本 | 映射合同不变：合格 delta 先进入文本。 |
| `sessions-delete-session` | 2 | 删除会话后暂存附件还在 | 删除仍清掉这些文件。 |
| `release-powershell-integration` | 1 | `publish-work-release.ps1` 本地暂存被判成对外发布成功 | 本地暂存不得打印或返回生产发布成功。 |

# 3. 能力清单

## 3.1 当前

| 能力 | 现有所有者 | 入口 | 当前测试 |
|---|---|---|---|
| 正式 Windows 打包门禁 | `scripts/build-work-release.ps1` | `npm test` 失败即终止 | 本次 103 failed / 2834 passed |
| 知识库烘焙 | `prepareKnowledgeBuildConfig` | `.env` 的 `SMC_KNOWLEDGE_SERVICE_URL` | `tests/work-knowledge-build-config.test.ts` |
| Hermes 运行时 userData | `workRuntimeConfigPath` | `electron.app.getPath` | account / wallet / hermes-account |
| 生成文件名 | `sanitizeGeneratedFileName` | agent output | `generated-file-name.test.ts` |
| 会话元数据 | `upsertSessionMetadata` | skill-run 材料化 | `skill-run-session-materialize.test.ts` |

## 3.2 目标

| 能力 | 生产所有者 | 允许实现数 |
|---|---|---:|
| 发版测试门 | 同一条 `npm test` | 1 |
| 知识库烘焙 | 同一函数 | 1 |
| userData 读取 | 同一函数 | 1 |
| 生成文件名 | 同一函数 | 1 |
| skill-run 会话落库 | 现有材料化函数 | 1 |

没有第二套测试脚本，没有“发版跳过红的文件”的清单。

## 3.3 变更分类

| 项 | 动作 | 终态 |
|---|---|---|
| `npm test` 发版门 | KEEP | 仍是硬失败 |
| `.env` 对测试进程可见 | MODIFY | 子进程看不见 `.env` 注入的键；文件本身不改 |
| `E:\tmp` 测试路径 | REPLACE | `C:\tmp`，不存在则创建 |
| `app?.getPath` 在缺失导出时抛错 | MODIFY | 缺失时得到空 userData |
| `sanitizeGeneratedFileName` | MODIFY | 以 HF-G-01 为准 |
| 知识库 / Chat 产品行为 | KEEP | 只补测试夹具，不改发送与页面语义 |
| skill-run / IPC / 合同锁的通过标准 | KEEP | 修到满足现有标准；半边 IPC 按 HF-G-15 删除，不放宽清单 |

无兼容层。旧测试路径 `E:\tmp` 没有外部消费者。

# 4. 验收

- [ ] 在已加载 `apps/work/.env` 的前提下，`build-work-release.ps1` 的 `npm test` 退出码为 0（35 个失败文件与 hermes-account 套件全部通过）。
- [ ] 不加载 `.env` 再跑一次 `npm test`，退出码也是 0。
- [ ] `apps/work/.env` 文件内容不变。烘焙步骤仍读到其中的知识库地址；`npm test` 子进程里这些注入键为空。
- [ ] telemetry、feature-mode、token-store 使用 `C:\tmp`；目录不存在时由测试创建。
- [ ] `account-store` / `wallet-store` / `hermes-account` 在只有局部 electron 替身时能跑完，生产 `app.getPath("userData")` 的返回值不变。
- [ ] 生成文件名：`a<>:"/\\|?*b` → `a---------b`，120 字截成 80。
- [ ] skill-run 材料化的四条用例写入替身消息；绑定真正写失败时生产路径仍然失败，不报成功。
- [ ] 未执行 `electron-builder` 规则变更。修复合并后，用户再单独启动 0.7.10 打包。

# 5. 不在本文

- 不重新打包安装包。本文只定义让测试门变绿的修法。
- 不改企业模型占位符、登录或 zh-CN 文案（`580404ab` 已覆盖那部分）。
- 不处理签名证书。未签名开关仍由调用方设置。
- 不重锁业务模块 UI 基线。该检查已经不在 `npm run guard` 里。
