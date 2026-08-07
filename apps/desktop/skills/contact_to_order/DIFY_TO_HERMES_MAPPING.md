# Dify DSL 到 Hermes Skill 转换说明

## 原 Dify App

- 名称：合同解析V1.0-客户
- 模式：advanced-chat
- 作用：解析客户采购合同内容
- 文件上传：document/local_file；start 节点额外允许 image/document
- 依赖：langgenius/ollama

## 原流程图

```text
Start(uploadfile, issmple)
  ├─ if uploadfile.type in image
  │   ├─ if issmple == 0 -> LLM: 合同内容分析—图片2.5 -> aggregator
  │   └─ else           -> LLM: 合同内容分析—图片3.0 -> aggregator
  └─ else
      ├─ document-extractor(uploadfile)
      ├─ if issmple == 0 -> LLM: 合同内容分析—非图片2.5 -> aggregator
      └─ else           -> LLM: 合同内容分析—非图片3.0 -> aggregator
aggregator -> code: strip <think>, slice JSON -> answer
```

## Hermes Skill 承接方式

Hermes 不是静态 DAG workflow 引擎，因此转换为 skill 时采用“过程约束 + 脚本兜底 + schema 约束”的方式：

1. `SKILL.md` 固化分支规则和字段规则。
2. `model_routes.yaml` 保留 Dify 模型路由信息。
3. `prompts/contact_to_order_prompt.md` 保留原始抽取 Prompt，并修正为合法 JSON 输出。
4. `scripts/extract_text.py` 承接 Dify document-extractor 的本地兜底能力。
5. `scripts/clean_contact_to_order_json.py` 承接 Dify code 节点的输出清洗，并增加 JSON 标准化。
6. `schemas/orderinfo.schema.json` 固化最终输出结构。
```
