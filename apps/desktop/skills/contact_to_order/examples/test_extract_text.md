# extract_text.py 测试用例

`SKILL_DIR` 请替换为本机 skill 目录，例如：`C:\Users\Administrator\.hermes\skills\contact_to_order`

## 前置

```powershell
$SKILL_DIR = "C:\Users\Administrator\.hermes\skills\contact_to_order"
$PDF = "<你的采购合同.pdf 绝对路径>"   # 必填：真实 PDF
pip install pymupdf pypdf pyyaml -q
# Ollama 需可达：http://192.168.70.249:11434/v1
```

---

## 用例 1：仅本地抽文本（不调 LLM）

验证 PDF 文本层 / 路径是否正确。

```powershell
python "$SKILL_DIR\scripts\extract_text.py" "$PDF" --extract-only
```

**期望**：`ok: true`，`mode: extract_only`，`chars > 0`（扫描件可能为 0，此时用例 2 更重要）。

---

## 用例 2：PDF 视觉 + LLM 解析（无回调）

```powershell
python "$SKILL_DIR\scripts\extract_text.py" "$PDF" --issmple 0
```

**期望 stdout 精简字段**（无 callback 时输出完整 JSON）：

- `ok: true`
- `parse_mode: pdf_vision`（已装 pymupdf）
- `pdf_pages_sent >= 1`
- `orderinfo` 非空数组
- `.run\last_llm_raw.txt` 已更新

---

## 用例 3：完整流程（Panel 参数 + SDMS 回调）

```powershell
Copy-Item "$SKILL_DIR\examples\skill_params.sample.json" "$SKILL_DIR\.run\skill_params.json" -Force
python "$SKILL_DIR\scripts\extract_text.py" "$PDF" --skill-params-file "$SKILL_DIR\.run\skill_params.json"
```

**期望 stdout**：

- `callback_applied: true`
- `web_url_file_updated: true`
- `file_path` 与 `$PDF` 一致
- `llm_raw_output_file`、`web_url_file` 路径存在

**验证落盘文件**：

```powershell
Get-Content -Raw "$SKILL_DIR\.run\last_llm_raw.txt" | Select-Object -First 1
Get-Content -Raw "$SKILL_DIR\.run\last_web_url.txt" | Select-Object -First 1
(Get-Item "$SKILL_DIR\.run\last_web_url.txt").LastWriteTime
```

---

## 用例 4：从 Hermes 附件索引解析路径再解析

```powershell
python "$SKILL_DIR\scripts\resolve_attachment_path.py" "华尧订单.pdf" --session-id draft_weboperator
# 将上一命令 stdout 里的 storage_path 赋给 $PDF
python "$SKILL_DIR\scripts\extract_text.py" $PDF --issmple 0 --skill-params-file "$SKILL_DIR\.run\skill_params.json"
```

**期望**：`resolve` 返回 `ok: true`、`file_exists: true`。

---

## 用例 5：离线单元测试（不连 Ollama）

```powershell
python "$SKILL_DIR\scripts\test_extract_text_offline.py"
```

**期望**：全部 `OK`，退出码 0。

---

## 常见失败对照

| 现象 | 原因 |
|------|------|
| `file_not_found` | `$PDF` 路径错误或未加引号 |
| `empty_document_text` 且非 pdf_vision | 未装 pymupdf，扫描 PDF 无文本层 |
| `ollama unreachable` | 249:11434 不可达或模型未 pull |
| `callback_applied: false` | orderinfo 空或 callbackURL 非法 |
| `last_web_url.txt` 未变 | 本次未 `web_url_file_updated:true`（见 stdout） |
