落到哪个目录（不是 hermes-agent 源码树）
Main 在 hermes-default-chat-attachments.ts 里写入 Profile Home 下的桌面专用目录，不会拷到 ~/.hermes/skills 或 Gateway 工作区。

项	路径（default profile）
Profile 根
profileHome() → 默认 %USERPROFILE%\.hermes（HERMES_HOME）
单会话附件目录
{profileHome}/desktop/chat-attachments/{sessionId}/
单个文件
{sessionId}/{uuid}_{安全化文件名}
索引
{profileHome}/desktop/chat-attachments/index.json
sessionId 来自 useHermesDefaultWebChat：无活动会话时为 draft_default（与 Main 的 HERMES_DRAFT_SESSION_ID 一致）。

示例：

C:\Users\<你>\.hermes\desktop\chat-attachments\draft_default\
  a1b2c3d4-...._report.pdf
  index.json   # 在上一级 desktop/chat-attachments/index.json
上传实现片段：


hermes-default-chat-attachments.ts
Lines 20-22
function sessionDir(profile: string | undefined, sessionId: string): string {
  return join(profileHome(profile), "desktop", "chat-attachments", sessionId);
}
3. 「发送」时如何交给 hermes-agent
附件不会再上传到 Gateway 的某个 upload API；发送时 Main 用 attachment_ids 从 index.json 读出元数据，在 sendMessage → buildUserMessageContent 里拼进 POST /v1/chat/completions 的 messages：


hermes.ts
Lines 255-259
  const userContent: ChatMessageContent = await buildUserMessageContent(
    message,
    profile,
    options?.attachmentIds ?? [],
  );
buildUserMessageContent 行为（hermes-default-chat-attachments.ts）：

图片：读 storage_path → base64 → multimodal image_url
PDF（contact_to_order）：`extract_text.py` 用 PyMuPDF 将 PDF 逐页转 PNG，再以 `image_url` 送入 Ollama 视觉模型（**不是**只抽文本层）
文本类：读文件或 text_preview，拼成 [File: name]\n... 放进 prompt 文本
其它二进制：尽量当文本读，失败则占位 [attachment: name]
也就是说：Gateway / Agent 侧通常只看到对话里的文本或多模态块，看不到 desktop/chat-attachments/... 这条磁盘路径。

4. 为什么 Skill 读附件会报错（常见原因）
Skill 若用 read_file / cat 等工具按路径读附件，往往会失败，因为：

文件在 ~/.hermes/desktop/chat-attachments/，不在 Agent 默认 workspace（如 session workspace、uploads/ 等）。
聊天请求里没有把 storage_path 作为 tool 可访问路径传给 Gateway（只内联进 message content）。
与 Workspaces Chat 不同：那边对二进制会用 stageAttachment 落到 Agent 可读路径（attachmentUtils.ts 的 path-ref）；Local Hermes Chat 当前没有这条链路。
PRD v6.2_weboperator-hermes-panel-attachments.md 也写明：附件落在 desktop/chat-attachments/{sessionId}，发送前由 buildUserMessageContent 读入 prompt，不是再拷一份到 hermes-agent 目录。

若你的 Skill 期望类似：

~/.hermes/workspace/...
或消息里的某个 attachments[].path
而实际只有 Desktop 侧 storage_path + 内联正文，工具读盘就会报 文件不存在 / 路径无效。

---

## 5. 与 contact_to_order skill 的对接结论

### 5.1 Panel 落盘 vs Agent 可见信息

| 层级 | 有什么 | 没有什么 |
|------|--------|----------|
| 磁盘 | `index.json` 里完整的 `storage_path`（绝对路径） | — |
| 发给 Gateway 的消息 | `[File: 华尧订单.pdf]` + 内联预览/乱码 | **不会**附带 `storage_path`、`attachment_ids` |
| Agent 默认 workspace | skills、sessions 等 | **不包含** `desktop/chat-attachments/` |

因此：**Agent 不能从对话正文“猜”路径**；必须通过 `index.json`（或 `resolve_attachment_path.py`）桥接。

### 5.2 skill 能否把准确路径交给 extract_text.py？

**能，前提是用 terminal + 绝对路径，且解析 index。**

本机实测（`index.json`）：

- 用户可见名：`name` = `华尧订单.pdf`（与 `[File: …]` 一致）
- 磁盘文件名：`{uuid}_____.pdf`（中文被安全化，**不要**手拼磁盘名）
- 可靠字段：`storage_path` = `C:\Users\...\desktop\chat-attachments\{sessionId}\{uuid}_____.pdf`

推荐命令链：

```bash
# 1) 从消息里确认 [File: 华尧订单.pdf]，再解析路径（WebOperator 会话多为 draft_weboperator）
python <skill_dir>/scripts/resolve_attachment_path.py "华尧订单.pdf" --session-id draft_weboperator

# 2) 用 stdout 的 storage_path（且 file_exists: true）
python <skill_dir>/scripts/extract_text.py "<storage_path>" --issmple 0
```

`extract_text.py` 用 `Path(附件路径).open()` 读本地文件，**不依赖** Agent workspace；只要 `storage_path` 正确即可。

### 5.3 仍可能不准的场景

| 风险 | 说明 | 缓解 |
|------|------|------|
| 同名多份 | 多次上传 `华尧订单.pdf`，index 多条 | `--session-id draft_weboperator` 或 `--latest --mime application/pdf` |
| sessionId 不一致 | 文档写 `draft_default`，WebOperator 实际为 `draft_weboperator` / `api-*` | 以 index 条目的 `session_id` 为准 |
| Agent 不用 index | 继续 `execute_code` 内嵌 PDF | 遵守 SKILL「Hermes Agent 执行约束」 |
| Gateway 在远端 | terminal 跑在另一台机器，无本机 `~/.hermes` | 需共享盘或改 Panel 下发 `storage_path`（产品层改造） |

### 5.4 与 read_file / write_file 的区别

- `read_file` 按 **Agent workspace** 解析路径 → 对 `desktop/chat-attachments/...` 常报不存在。
- `terminal` + `extract_text.py` + **index 中的绝对 `storage_path`** → 与 Panel 落盘一致，**这是 skill 设计的正确链路**。

### 5.5 产品层改进方向（可选）

若希望 Agent **无需** 读 index.json，可在 `buildUserMessageContent` 或 system 附加上下文增加一行：

```text
[AttachmentMeta: 华尧订单.pdf | path=C:\...\storage_path | id=uuid]
```

或把 PDF stage 到 Gateway workspace（对齐 Workspaces Chat 的 `path-ref`）。当前 skill 方案在**本机 Hermes Panel + 本机 Agent terminal** 下已可闭环。

---

## 6. `[SkillParamsJSON]` / `[AttachmentMetaJSON]`（桌面端新链路）

发送时 Main 会通过 `message-skill-params.ts` + `buildUserMessageContent` 在消息末尾追加：

```text
[SkillParamsJSON]
{ "callbackURL": "http://...&tempType=", "issmple": "1" }
```

HostBridge 首条任务（`build-task-first-message.ts`）同样附带。侧栏 System Prompt（`constants.ts`）要求 Agent **从 JSON 取值**并加引号，不要从自然语言抠 URL。

| 块 | skill 用法 |
|----|------------|
| `[SkillParamsJSON]` | **唯一可信**的 `issmple` / `callbackURL` 来源 → 写入文件 → `extract_text.py --skill-params-file` |
| `[AttachmentMetaJSON]` | **优先**取 `storage_path`，避免只靠 `[File: name]` + index 猜路径 |

**不要**再把 `callbackURL=http://...&tempType=` 原样拼进 PowerShell；`&` 会截断命令。详见 `SKILL.md`「Hermes Panel 参数块」。