---
name: contact_to_order
description: "Parse procurement contracts/PO attachments into order JSON via Ollama; supports Hermes Panel attachments and callback WebUrl."
version: 1.2.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [contract, order, pdf, ocr, ollama, procurement, contact_to_order]
    related_skills: [hermes-agent]
---

# contact_to_order

## 目标

将客户上传的电子元器件采购合同、采购订单、合同截图、PDF、Word、Excel、图片等附件解析为稳定可读的订单 JSON。

本 skill 由 Dify DSL「合同解析V1.0-客户」迁移而来，保留原工作流的分支规则、字段规则、模型选择逻辑与最终 JSON 清理逻辑。

## 触发条件

当用户上传采购合同、采购订单、PO、销售合同、合同截图，并要求“解析合同”“生成订单 JSON”“合同转订单”“contact_to_order”时，启用本 skill。

典型输入：

```text
使用 contact_to_order 解析附件，issmple=0
```

带回调地址（解析成功后生成可点击的导入链接）：

```text
使用 contact_to_order 解析附件，issmple=0，callbackURL=https://your-app.example.com/import?data=
```

如用户没有提供 `issmple`，默认按 `issmple=0` 执行；如附件缺失，先要求用户上传合同附件。

## Hermes Panel 参数块（必读，优先于正文抠参）

桌面端发送消息时会在正文末尾自动追加结构化块（需**完整重启应用**后 Main 侧生效）。**Agent 必须优先读取这些块**，不要从自然语言正文里截取半截 URL（尤其含 `&` 的 `callbackURL`）。

### `[SkillParamsJSON]` — 唯一可信的参数来源

用户消息末尾示例：

```text
使用 contact_to_order 解析附件，issmple=1，callbackURL=http://192.168.99.35:8080/...
[SkillParamsJSON]
{
  "callbackURL": "http://192.168.99.35:8080/sdms/om/sdms_om_main/sdmsOmMain.do?method=addSoDesktop&tempType=",
  "issmple": "1"
}
```

**规则：**

1. 若存在 `[SkillParamsJSON]`，**只从该 JSON 读取** `issmple`、`callbackURL`（或 `callbackUrl`）、`skill` 等；正文里的 `issmple=1，callbackURL=...` 仅作展示，**不得**再用手工从正文复制 URL 到命令行。
2. 将 JSON 原样写入临时文件（勿改 URL、勿插入空格），例如 `<skill_dir>/.run/skill_params.json`。
3. 调用 `extract_text.py` 时使用 `--skill-params-file`，**不要**把完整 `callbackURL` 裸拼进 PowerShell 命令行。

```powershell
# 1) 将 [SkillParamsJSON] 块内容写入文件（由 Agent 用 write_file 一次完成）
# 2) 解析附件并执行（推荐）
python <skill_dir>/scripts/extract_text.py "<path>" --skill-params-file "<skill_dir>/.run/skill_params.json"
```

HostBridge 首条任务消息同样带 `[SkillParamsJSON]`，处理方式相同。

### `[AttachmentMetaJSON]` — 附件路径（优先于 index 猜名）

Hermes Desktop Main 在发送时追加（字段与 `src/main/hermes-default-chat/hermes-default-chat-attachments.ts` 中 `formatAttachmentMeta` 一致）。**磁盘绝对路径在 JSON 字段 `path`**（不是 `storage_path`）。

示例（紧跟在 `[File: 华尧订单.pdf]` 后）：

```text
[AttachmentMetaJSON] {"name":"华尧订单.pdf","path":"C:\\Users\\...\\.hermes\\desktop\\chat-attachments\\draft_weboperator\\{uuid}______.pdf","id":"be3e07a8-...","session_id":"draft_weboperator","mime":"application/pdf"}
```

**规则：**

1. 若存在 `[AttachmentMetaJSON]`，**只从该 JSON 读取** `path`（绝对路径，即落盘的 `storage_path`），以及 `name`、`id`、`session_id`、`mime`；直接作为 `extract_text.py` 的第一个参数。
2. **禁止**手拼 `chat-attachments/{sessionId}/文件名`；磁盘文件名为 `{uuid}_{安全化文件名}`，与 `name` 可能不同。
3. WebOperator 侧栏 `session_id` 多为 **`draft_weboperator`**（与全页 Chat 的 `draft_default` 不同）。
4. 仅当**没有** `[AttachmentMetaJSON]` 时，再用 `resolve_attachment_path.py` + `index.json`（脚本 stdout 字段名为 `storage_path`，见下文「附件路径解析」）。

### 禁止事项（参数相关）

| 禁止 | 正确 |
|------|------|
| 从正文「抠」`callbackURL`，在 `&` 处断裂 | 只用 `[SkillParamsJSON]` 里的完整字符串 |
| `--callback-url http://...&tempType=` 无引号（PowerShell） | `--skill-params-file` 或 `--callback-url-file` |
| 手写 `8080` 等残缺 URL | 校验 JSON 内 URL 无空格、以 `tempType=` 结尾 |

## 输入参数

| 参数 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| uploadfile | file | 是 | 用户上传的采购合同/PO/订单附件。支持 image/document。路径优先 `[AttachmentMetaJSON].path`（绝对路径）；无 Meta 时用 `resolve_attachment_path.py` 得到 `storage_path`。 |
| issmple | number | 否 | 保留 Dify 原变量名。`0` → 2.5 路线；非 `0` → 3.0 路线。默认 `0`。**优先读 `[SkillParamsJSON].issmple`**。 |
| callbackURL | string | 否 | 回调基础 URL（`http`/`https`，无空格）。**优先且应当只读 `[SkillParamsJSON].callbackURL` / `callbackUrl`**。传给脚本用 `--skill-params-file` 或 `--callback-url-file`，不要裸拼命令行。 |

## Dify 到 Hermes 的节点映射

| Dify 节点 | Hermes skill 步骤 |
|---|---|
| 上传附件 | 校验附件是否存在，判断 image/document 类型 |
| 条件分支：uploadfile.type in image | 图片走视觉分析 |
| PDF 附件 | **PDF 转页图 → 视觉模型**（非仅 pypdf 抽文本） |
| document-extractor | 对 Word/Excel/TXT 等做文本抽取；PDF 文本仅作视觉失败时的回退 |
| 条件分支：issmple == 0 | 选择 qwen2.5vl:7b 兼容路线 |
| 条件分支：issmple != 0 | 选择 qwen3-vl:30b 兼容路线 |
| 变量聚合器 | 只聚合当前分支模型输出 |
| 代码执行 | 移除 `<think>`，截取第一个 `{` 到最后一个 `}`，再做 JSON 标准化 |
| 直接回复 | 只输出最终 JSON，不输出解释 |

## 模型路由

严格保持 Dify 原始分支意图。

### Ollama 服务器

所有模型托管在统一 Ollama 实例：
- **地址**: `http://192.168.70.249:11434/v1`
- **API 格式**: OpenAI-compatible (支持 `/v1/chat/completions`)

如果 Hermes 配置了该 Ollama 服务器的 provider，优先使用指定模型。否则回落当前可用视觉/文档模型，但保留字段规则与 JSON 输出规则。

### 路由表

| 附件类型 | issmple | 目标模型 | 上下文参数 |
|---|---:|---|---|
| image | 0 | qwen2.5vl:7b | num_ctx=5048, num_predict=5048 |
| image | 非 0 | qwen3-vl:30b | num_ctx=5048, num_predict=5048 |
| document | 0 | qwen2.5vl:7b | num_ctx=20480, num_predict=10240 |
| document | 非 0 | qwen3-vl:30b | num_ctx=20480, num_predict=10240 |

> **注意**: 如果当前 Hermes profile 不能在 skill 内部强制切换模型，则使用当前可用的视觉/文档模型执行，但必须保留本 skill 的字段规则与 JSON 输出规则。需要强制模型切换时，应升级为 Hermes plugin/MCP tool，由工具内部调用指定的 OpenAI-compatible endpoint (`http://192.168.70.249:11434/v1`)。

## Hermes Agent 执行约束（必读）

会话里 `[File: xxx.pdf]` 后面跟的 `%PDF-1.7`、`\x00` 等是**给模型看的预览**，不是可执行代码。PDF/Word/Excel/图片是**二进制文件**，禁止下列做法（会触发 `SyntaxError: source code cannot contain null bytes` 或内存溢出）：

| 禁止 | 正确做法 |
|------|----------|
| `execute_code` 里写 `pdf_bytes = b'%PDF...'` 或把附件正文放进 Python 字符串 | **只用 `terminal`** 调用 `extract_text.py`，参数为**磁盘路径** |
| `write_file` 把聊天里的 PDF 原始字节当文本写入 | 附件已由 Hermes 落盘，用 `[AttachmentMetaJSON].path` 或 resolve 的 `storage_path` |
| `read_file` 读取整份 PDF 再拼进 Prompt/脚本 | 由 `extract_text.py` 在本地读文件并抽文本/调 Ollama |
| 手写 Python 调 Ollama 重复实现解析 | 一条 `terminal` 命令跑 skill 脚本即可 |

### 附件路径解析（在跑脚本之前）

Hermes Panel 上传细节见同目录 `read_file_guide.md`。

**优先级：**

1. **`[AttachmentMetaJSON]`** → 使用其中的 **`path`**（绝对路径，等同 index 里的 `storage_path`）。
2. 否则从 `[File: 华尧订单.pdf]` 得到文件名，查 `index.json` 或跑 `resolve_attachment_path.py`（stdout 字段 **`storage_path`**）。

旧版仅 `[File: …]` 时：Gateway 消息里没有路径，真实路径在 `index.json`。

1. 从用户消息提取文件名（如 `[File: 华尧订单.pdf]` → `华尧订单.pdf`）。
2. 查 `~/.hermes/desktop/chat-attachments/index.json` 中 `attachments[*].name`，使用字段 **`storage_path`**（绝对路径）。磁盘上的 `{uuid}_安全化名` 与显示名可能不同，**禁止手拼路径**。
3. WebOperator / 模板识别场景 `session_id` 多为 `draft_weboperator`（不是 `draft_default`），同名附件多时必须带 session 过滤。
4. 推荐辅助脚本（输出含 `file_exists`）：

```bash
python <skill_dir>/scripts/resolve_attachment_path.py "华尧订单.pdf" --session-id draft_weboperator
```

或当前会话最新 PDF：

```bash
python <skill_dir>/scripts/resolve_attachment_path.py --latest --mime application/pdf --session-id draft_weboperator
```

确认 `ok:true` 且 `file_exists:true` 后，将 `storage_path` 传给 `extract_text.py`（**不要**用 `read_file` 读 PDF 内容，也不要内联到 `execute_code`）。

### 标准 terminal 命令（复制即用）

**Hermes Panel 已带 `[SkillParamsJSON]` 时（首选）：**

`<path>` = `[AttachmentMetaJSON].path`；若无 Meta，用 `resolve_attachment_path.py` 的 `storage_path`。

```powershell
python <skill_dir>/scripts/extract_text.py "<path>" --skill-params-file "<skill_dir>/.run/skill_params.json"
```

无 Panel 参数块、手工调试时：

```bash
python <skill_dir>/scripts/extract_text.py "<storage_path>" --issmple 0
```

带回调且**没有** `--skill-params-file` 时，见 §3 的 `--callback-url-file`（勿裸拼 `&` URL）。

`<skill_dir>` 示例：`C:/Users/Administrator/.hermes/skills/contact_to_order`（以本机 `~/.hermes/skills/contact_to_order` 为准）。

## 执行流程

### 1. 校验附件

确认当前会话中存在 `uploadfile`（或 `index.json` 中能解析到 `storage_path`）。如存在多个附件，逐个解析，最终返回数组形式的 `results`；如只存在一个附件，返回 `{"orderinfo":[...]}`。

### 2. 判断文件类型

- image：jpg、jpeg、png、webp、bmp、tiff、gif，直接走视觉合同解析（`image_url` 传图）。
- **pdf**：优先 **PDF→逐页 PNG→视觉模型**（`parse_mode=pdf_vision`，与图片相同 multimodal 通道；需 `pip install pymupdf`）。Ollama **不支持**直接把 PDF 二进制塞进 `chat/completions`。
- document（非 pdf）：docx、xlsx、csv、txt 等，先本地抽文本再送 LLM（`parse_mode=document_text`）。pdf 视觉失败且文本层为空时报错。
- 其他类型：提示“不支持该文件类型”，不要编造结果。

### 3. 调用 Ollama 解析（推荐，一步完成）

**仅通过 `terminal` 调用**本目录 `scripts/extract_text.py`（不要用 `execute_code` 内联附件）。脚本按 `model_routes.yaml` 选择模型与 `num_ctx`/`num_predict`，在本地读文件并调用 Ollama，自动清洗 JSON。

```bash
python <skill_dir>/scripts/extract_text.py "<storage_path>" --issmple 0
```

用户提供了回调地址时：

- **有 `[SkillParamsJSON]`**：只用 `--skill-params-file`（见上文），**禁止**从正文复制 URL 到 `--callback-url`。
- **无参数块、手工调试**：含 `&` 的 URL 在 PowerShell 必须加引号，否则会出现 `:8080 8080/` 等空格错误。

**Panel 场景（首选）：**

```powershell
python <skill_dir>/scripts/extract_text.py "<path>" --skill-params-file "<skill_dir>/.run/skill_params.json"
```

**手工调试（PowerShell 单引号）：**

```powershell
python <skill_dir>/scripts/extract_text.py "<storage_path>" --issmple 1 --callback-url 'http://192.168.99.35:8080/sdms/om/sdms_om_main/sdmsOmMain.do?method=addSoDesktop&tempType='
```

**或写入文件避免 shell 转义（Agent 最稳）：**

```powershell
Set-Content -Path "<skill_dir>/callback_url.txt" -Value 'http://192.168.99.35:8080/sdms/om/sdms_om_main/sdmsOmMain.do?method=addSoDesktop&tempType=' -NoNewline
python <skill_dir>/scripts/extract_text.py "<storage_path>" --issmple 1 --callback-url-file "<skill_dir>/callback_url.txt"
```

**或环境变量：**

```powershell
$env:CONTACT_TO_ORDER_CALLBACK_URL='http://192.168.99.35:8080/sdms/om/sdms_om_main/sdmsOmMain.do?method=addSoDesktop&tempType='
python <skill_dir>/scripts/extract_text.py "<storage_path>" --issmple 1
```

Linux/macOS 双引号示例：

```bash
python <skill_dir>/scripts/extract_text.py "<storage_path>" --issmple 1 --callback-url "http://192.168.99.35:8080/sdms/om/sdms_om_main/sdmsOmMain.do?method=addSoDesktop&tempType="
```

- `issmple=0`：image/document 均走 `qwen2.5vl:7b`（document 的 `num_ctx=20480`, `num_predict=10240`；image 为 `5048`/`5048`）。
- `issmple!=0`：走 `qwen3-vl:30b`，上下文参数同上。
- 图片：base64 送入视觉模型；文档：先本地抽文本再送 LLM。
- 成功时 stdout 含 `{"ok":true,"orderinfo":[...],...}`。
- **有 callbackURL 且回调成功**：stdout 为精简 JSON（含 `llm_raw_output_file`、`file_path`、`web_url_file`、`web_url_file_updated:true` 等），**不含**内嵌长 `web_url` 或完整 `llm_raw` 正文。
- **无 callbackURL**：最终对用户只输出 `{"orderinfo":[...]}`。
- **有 callbackURL 且生成成功**：最终对用户按顺序输出：**① LLM 原生解析内容**（`normalize_model_output` 之前 Ollama 返回的原文，从 stdout 的 `llm_raw_output_file` 用 `Get-Content -Raw` 读取，原样放入代码块）**② 上传附件完整路径**（`file_path`）**③ 一条 Markdown 超链接**（见 §7 从 `web_url_file` 读取）。不要附加清洗后的 `orderinfo` JSON、长段说明或 URL 正文。

仅调试本地文本抽取（不调用 LLM）：

```bash
python <skill_dir>/scripts/extract_text.py <附件路径> --extract-only
```

若文档抽不出文本或 Ollama 调用失败，必须报错，不得凭文件名猜测合同内容。

### 4. 合同信息抽取 Prompt

由 `extract_text.py` 自动加载 `prompts/contact_to_order_prompt.md` 的 System / User Rules，无需 Agent 手工拼接。

### 5. 输出清洗与标准化

`extract_text.py` 已内联调用 `clean_contact_to_order_json.py` 的规则。若单独拿到模型原始输出，可再执行：

```bash
python <skill_dir>/scripts/clean_contact_to_order_json.py raw_model_output.txt
```

### 6. 最终回复（无回调）

未提供 `callbackURL` 时：最终回复只输出 JSON，不输出分析说明、Markdown 标题、代码块或解释文字。

### 7. 回调 WebUrl（有 callbackURL）

当用户提供了 `callbackURL`，且 `extract_text.py` 返回 `ok:true`、`callback_applied:true`、`web_url_file_updated:true` 时：

1. 脚本内部逻辑（与前端 `encodeURIComponent` 一致）：
   - `postData = { "tempType": orderinfo }`（`orderinfo` 为解析得到的数组）
   - `jsonData = encodeURIComponent(JSON.stringify(postData))`
   - 若 `callbackURL` 未以 `tempType=` 结尾，脚本自动补上 `&tempType=`；否则 `WebUrl = callbackURL + jsonData`
   - **LLM 原生输出**（`normalize_model_output(raw)` 之前的 `raw`）写入 `<skill_dir>/.run/last_llm_raw.txt`。
   - **完整 `WebUrl`** 写入 `<skill_dir>/.run/last_web_url.txt`（单行）；stdout 带文件路径与 mtime，**不内嵌**长正文（避免 terminal 截断）。
2. 脚本校验 `callbackURL`（`http`/`https`、无空格）及 **主机与 callback 一致**。
3. Agent **必须先读取** `web_url_file`（并核对 `web_url_file_mtime` 为本次运行时间）再生成超链接，**禁止**根据 `orderinfo` 自己拼 URL。
4. **对用户回复顺序（不可调换）**：
   - **① LLM 原生输出**：读取 `llm_raw_output_file`（对应 `extract_text.py` 在 `normalize_model_output(raw)` 之前的 `raw`），原样展示，勿改写。
   - **② 附件路径**：stdout 的 **`file_path`**（脚本实际读取的落盘绝对路径）。不得只写文件名。
   - **③ WebUrl 链接**：从 `web_url_file` 读取生成 Markdown 超链接。

**`last_web_url.txt` 何时会“不更新”（最常见）**

| 情况 | stdout 信号 | 说明 |
|------|-------------|------|
| Agent 未跑 `extract_text.py` | 无 `web_url_file_updated` | 文件仍是**上一次**成功运行的内容 |
| 未传 `callbackURL` | `web_url_file_skip_reason` | 只解析 JSON，不写 URL 文件 |
| LLM/附件失败 | `ok:false` | 未进入回调逻辑 |
| `orderinfo` 为空 | `callback_applied:false` | `web_url_file_updated:false` |
| URL 校验失败 | `callback_error` | 保留旧文件 |

```powershell
$raw = Get-Content -Raw "<llm_raw_output_file>"
$url = Get-Content -Raw "<web_url_file>"
```

**对用户固定格式**（三项缺一不可；均取自本次 stdout，勿手写）：

1. 标题「LLM 原生解析：」+ 代码块，内容为 `$raw` 全文（`normalize_model_output` 之前的 Ollama 原文）。
2. 一行「附件：」+ `` `file_path` `` 绝对路径。
3. 一行 Markdown 链接「打开订单导入页面」，URL 为 `$url`。

示例（对用户可见部分）：

    LLM 原生解析：
    {"orderinfo":[{"custname":"..."}]}

    附件：`C:\Users\Administrator\.hermes\desktop\chat-attachments\api-xxx\a763e0c2-....pdf`
    [打开订单导入页面](http://192.168.99.35:8080/sdms/om/...)

**常见错误（必须避免）：**

| 错误 | 表现 | 正确做法 |
|------|------|----------|
| 手工拼 URL | IP 变成 `190.168.99.35`、丢参数 | 只读 `web_url_file`，看 `web_url_file_mtime` |
| 从聊天 HTML 复制 | `&` 变成 `&amp;` | `Get-Content -Raw` 读文件（裸 `&`） |
| 只看旧文件 | 内容与本次 orderinfo 不符 | 确认本次 stdout 有 `web_url_file_updated:true` |
| 改写主机/method | 与 `[SkillParamsJSON]` 不一致 | 以 JSON 块中的 `callbackURL` 为准 |

可先核对 stdout 中 `callback_host` 是否为 `192.168.99.35:8080`（示例），再返回链接。不要同时粘贴完整 JSON，除非用户明确要求查看原始 `orderinfo`。

若 `callback_applied:false` 或缺少 `web_url`，说明解析失败或 `orderinfo` 无效或 URL 非法，向用户说明 `callback_error` 字段内容，并视情况附上 `orderinfo` JSON。

## 输出 JSON Schema

`orderinfo` 为**数组**，每个元素对应合同中的一行物料；表头字段（客户、订单号、供应商）在每行重复填写。

```json
{
  "orderinfo": [
    {
      "custname": "采购公司名称或 null",
      "orderno": "采购订单号/合同号或 null",
      "supname": "供货公司名称或 null",
      "deliverydate": "YYYY-MM-DD 或 null",
      "partno": "料号/物料编码/型号，去除全部空格，或 null",
      "partdesc": "规格/描述/物料名称/description 或 null",
      "quantity": 0,
      "price": "0.000000 或 null",
      "amount": "0.000000 或 null"
    }
  ]
}
```

## 字段规则

### orderinfo[].custname

采购公司名称。不可从文件名、上传者、聊天上下文推断；合同正文没有则填 `null`。每行物料均填写相同值（若合同有）。

### orderinfo[].orderno

采购订单号、PO号、合同号、订单编号。多个编号时优先选择客户采购订单号，其次合同号；无法确定则填 `null`。每行重复填写。

### orderinfo[].supname

供货公司名称。不可编造；没有则填 `null`。每行重复填写。

### orderinfo[].deliverydate

交货日期必须输出 `YYYY-MM-DD`。若原文只有月份或周数且无法确定具体日期，填 `null`，不要补日期。

### orderinfo[].partno

从“料号、物料代码、物料编码、物料型号、material、材料编码”等字段提取。去掉所有空白字符，包括半角空格、全角空格、Tab、换行。

### orderinfo[].partdesc

从“规格、描述、物料名称、description”等字段提取。保留必要规格文字，不要把单价、数量、日期混入描述。

### orderinfo[].quantity

转为整数类型。必须保持完整数量，不得四舍五入造成数量损失；无法解析则填 `null`。

### orderinfo[].price

单价保留 6 位小数。为避免 JSON number 丢失尾随 0，输出为字符串，例如 `"0.123000"`。为空或无法解析则填 `null`。

### orderinfo[].amount

行金额/小计，保留 6 位小数字符串。合同有行金额则直接提取；未给出且 `quantity`、`price` 均有值时，按 `quantity × price` 计算并格式化为 6 位小数。无法解析则填 `null`。

## 禁止事项

- **不得**将 PDF/Office/图片二进制写入 Python 源码、`execute_code`、`write_file` 文本（见「Hermes Agent 执行约束」）。
- 不得编造不存在的客户、供应商、订单号、交期、料号、数量、单价、金额。
- 无 `callbackURL` 时：不得输出中文解释或 Markdown 包装（仅 JSON）。
- 有 `callbackURL` 且已生成 `web_url` 时：只允许输出 §7 规定的单条超链接（可一行简短提示，如「解析完成，请点击打开：」+ 链接）。
- 不得把多个物料合并为一行。
- 不得丢弃小数位；单价与金额需要固定 6 位。
- 不得把 `orderinfo` 输出为对象；必须是数组。
- 不得输出非 JSON 内容（回调成功时的超链接除外）。

## 多附件处理

如用户一次上传多个合同附件，输出：

```json
{
  "results": [
    {
      "file": "原始文件名",
      "orderinfo": []
    }
  ]
}
```

每个附件独立解析，不能跨附件合并客户、订单号和物料。
