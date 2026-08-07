# contact_to_order Hermes Skill

## 说明

该目录是从 Dify DSL「合同解析V1.0-客户」迁移出来的 Hermes skill，用于把客户上传的采购合同/PO/订单附件解析为订单 JSON。

## 安装

`SKILL.md` 已含 Hermes 要求的 YAML frontmatter（`name: contact_to_order`），安装后在新会话中 `skill_view('contact_to_order')` 即可加载。

### 打包（Windows）

```powershell
cd contact_to_order
.\package.ps1
# 生成 contact_to_order_skill.zip
```

### 本机安装（Windows，推荐）

```powershell
cd contact_to_order
.\install.ps1
# 默认安装到 %USERPROFILE%\.hermes\skills\contact_to_order
```

安装到 hermes-agent 源码树 skills 目录：

```powershell
.\install.ps1 -TargetRoot "D:\path\to\hermes-agent\skills"
```

### 本机安装（Linux / macOS）

```bash
./install.sh
# 或 ./install.sh /opt/hermes-agent/skills
```

### Docker 容器内安装

```bash
unzip contact_to_order_skill.zip
sudo docker cp contact_to_order hermes-writer:/opt/hermes-agent/skills/contact_to_order
sudo docker restart hermes-writer
```

安装完成后**新开 Agent 会话**或重启 Gateway/WebUI，再执行 `skill_view(name='contact_to_order')` 验证。

## 使用

在 Hermes WebUI 中上传合同附件，然后输入：

```text
使用 contact_to_order 解析附件，issmple=0
```

可选回调（解析成功后返回可点击导入链接）：

```text
使用 contact_to_order 解析附件，callbackURL=https://your-app.example.com/import?data=
```

**Hermes Agent 注意**：不要把聊天里的 PDF 二进制贴进 `execute_code`（会报 `null bytes`）。先从 `~/.hermes/desktop/chat-attachments/index.json` 取 `storage_path`，或：

```bash
python ~/.hermes/skills/contact_to_order/scripts/resolve_attachment_path.py "华尧订单.pdf"
```

再执行（`storage_path` 为磁盘绝对路径）：

```bash
python ~/.hermes/skills/contact_to_order/scripts/extract_text.py "<storage_path>" --issmple 0
```

带回调时：

```bash
python ~/.hermes/skills/contact_to_order/scripts/extract_text.py "<附件路径>" --issmple 0 --callback-url "https://your-app.example.com/import?data="
```

脚本会按 `model_routes.yaml` 调用 Ollama，并输出清洗后的 `orderinfo`。若提供 `--callback-url` 且成功，stdout 含 `web_url`；对用户展示 Markdown 链接 `[打开订单导入页面](web_url)`，否则只展示 JSON。

## 文件结构

```text
contact_to_order/
  SKILL.md
  README.md
  model_routes.yaml
  prompts/contact_to_order_prompt.md
  schemas/orderinfo.schema.json
  scripts/extract_text.py
  scripts/resolve_attachment_path.py
  scripts/clean_contact_to_order_json.py
  examples/sample_result.json
  install.sh
```

## 注意

纯 skill 能完整约束流程、字段、Prompt 与清洗步骤，但不能保证在同一轮对话内强制切换指定模型。若需要严格调用 `qwen2.5vl:7b` / `qwen3-vl:30b`，建议后续把本 skill 升级为 Hermes plugin 或 MCP tool，由工具内部调用 Ollama/OpenAI-compatible API。
