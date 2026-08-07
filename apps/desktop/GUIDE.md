

本地python 解析脚本
# 激活 python
D:\SmartCopilot\desktop\runtime\hermes\venv\Scripts

#设置变量
$SKILL_DIR = "C:\Users\Administrator\.hermes\skills\contact_to_order"
$PDF = "C:\Users\Administrator\.hermes\desktop\chat-attachments\draft_weboperator\40739290-902d-4502-bddc-e1a76d12e57b____-HC21826005096(1)(1).pdf"

# 不调 LLM
python "$SKILL_DIR\scripts\extract_text.py" "$PDF" --extract-only

# 完整解析（issmple=0，PDF 走视觉）
python "$SKILL_DIR\scripts\extract_text.py" "$PDF" --issmple 0

# 带回调（与 Panel 一致）
Copy-Item "$SKILL_DIR\examples\skill_params.sample.json" "$SKILL_DIR\.run\skill_params.json" -Force
python "$SKILL_DIR\scripts\extract_text.py" "$PDF" --skill-params-file "$SKILL_DIR\.run\skill_params.json"
