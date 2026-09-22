---
title: "smc-copilot Attachment Upload-Byte Gate P0.1 PRD"
subtitle: "Platform upload-byte readability gate; Knowledge first consumer"
prd_id: "PRD-WORK-ATTACHMENT-UPLOAD-BYTE-GATE-P0.1"
version: "1.0"
status: "APPROVED_FOR_PLAN"
product: "SMC Copilot Work Desktop"
repository: "https://github.com/loudon84/smc-copilot"
branch: "work/prd-v6.2.1"
owner: "SMC Copilot / Work File Platform"
reviewers:
  - "Work Desktop Architect"
  - "File Platform Owner"
  - "Knowledge Module Owner"
created_at: "2026-09-21"
updated_at: "2026-09-21"
approved_at: "2026-09-21"
approval_basis: "grilling Round1-3 shared understanding confirmed by owner 2026-09-21"
target_release: "v6.2.2"
change_type:
  - "BROWNFIELD_CHANGE"
  - "BUGFIX"
  - "ARCHITECTURE_CHANGE"
golden_consumer:
  - "apps/work Knowledge file upload (runProviderUpload / addFileVersion)"
related_docs:
  - "docs/work/smc-copilot-File-Import-P0-明文可读性校验-PRD-v1.0.md"
  - "docs/knowledge/smc-copilot-Knowledge-亿赛通加密文档识别与明文上传-PRD-v2.0.md"
  - ".cursor/plans/file_content_gate_p0_430d8822.plan.md"
  - "apps/work/src/main/knowledge/knowledge-job-runtime.ts"
  - "apps/work/src/main/files/protected-file-detector.ts"
supersedes: "NONE"
does_not_supersede:
  - "PRD-WORK-FILE-PROTECTED-CONTENT-P0 (Import Magic Gate retained)"
  - "PRD-WORK-KNOWLEDGE-EISOO-PROTECTED-FILE-v2.0 (Layer-2 Eisoo decrypt; separate)"
approval_basis: "grilling 2026-09-21 Round1-3 shared understanding"
---

# smc-copilot Attachment Upload-Byte Gate P0.1 PRD

> 本 PRD 由 2026-09-21 grilling 锁定；owner 已确认 Shared Understanding；status=`APPROVED_FOR_PLAN`。
>
> **问题事实：** Import 侧 P0 Magic Gate 已实现，但在亿赛通透明解密下可能对「看起来合法」的前缀 PASS，随后 `runProviderUpload` 将不可解析字节上传到 Knowledge Server（nodeskclaw-knowledge）。权威阻断点缺失。
>
> **本 PRD 只回答：** 即将离开客户端发往 Knowledge（及未来其他附件消费者）的 **Buffer**，是否具备声明类型的可读明文特征；不具备则 **MUST NOT** 发起上传，并提示用户。

---

# 0. 职责与边界

## 0.1 WHY / WHAT

```text
WHY   Import-time 前缀校验 ≠ 上传字节可读；透明解密造成假 PASS。
WHAT  独立 Upload-Byte Gate（Layer-1）：对即将上传的 bytes 做 STRICT 可读性校验；Knowledge 先挂接。
```

## 0.2 BOUNDARY

```text
IN
- 新 Main 模块 upload-byte-gate（File Platform 拥有）
- Knowledge：runProviderUpload + addFileVersion（及本产品内所有「本地 bytes → Knowledge HTTP」路径）
- 新错误码 FILE_UPLOAD_CONTENT_UNREADABLE
- Knowledge UI：禁止上传的明确提示

OUT
- Chat 附件行为（本阶段 MUST NOT 改）
- 亿赛通 SDK / 解密 / PreparedKnowledgeContent（归 v2.0 Layer-2）
- 修改用户源文件、明文落盘
- 删除或替换 Import P0 Magic Gate
- 改 ManagedFile.contentHash 语义
```

## 0.3 与相关 PRD 关系

| PRD | 角色 |
|---|---|
| Import P0 (`PRD-WORK-FILE-PROTECTED-CONTENT-P0`) | Layer-0 廉价预检；**保留** |
| **本 PRD P0.1** | **Layer-1 权威上传字节门禁**（平台层） |
| Eisoo v2.0 | Layer-2 Knowledge 保护识别/解密；产出明文后再进 Layer-1；**本 PRD 不修改其正文** |

```text
Layer-2 (optional, future) → bytes
Layer-1 Upload-Byte Gate (this PRD, required for Knowledge HTTP) → PASS | BLOCK
Knowledge HTTP uploadBaseFile / addFileVersion
```

---

# 1. 一句话目标

让 **Knowledge 本地文件上传** 在发起 HTTP 之前，对 **即将发送的 Buffer** 执行独立平台门禁；对 pdf/doc/docx/xls/xlsx，若字节不具备声明类型可读特征，则 **禁止上传**、Job 失败，并向用户提示「内容无法作为声明类型读取，已禁止上传」——从而堵住「Import P0 PASS 后仍把不可读内容送进 Knowledge Server」的缺口。

---

# 2. 问题定义（已观测）

```text
P0 Import Gate PASS（透明解密前缀合法）
  → ManagedFile / enqueue
  → runProviderUpload: readFile(managedPath||originalPath)
  → uploadBaseFile(bytes) 无二次校验
  → nodeskclaw-knowledge 收到不可解析内容
  → 用户未在上传前被明确禁止
```

---

# 3. Architecture

## 3.1 Owner

| 组件 | Owner | 职责 |
|---|---|---|
| `upload-byte-gate.ts` | File Platform | 对 `(declaredName, bytes)` 返回 PASS / NOT_APPLICABLE / REJECT |
| `knowledge-job-runtime.ts` | Knowledge | upload 前调用 Gate；REJECT → 零 HTTP |
| `register-knowledge-base-ipc.ts` addFileVersion | Knowledge | 同上 |
| KnowledgeUploadPanel | Knowledge UI | 映射新错误码为禁止上传文案 |
| Import `protected-file-detector` | File Platform | **不变** |

## 3.2 API（规范）

```ts
type UploadByteGateStatus = "PASS" | "NOT_APPLICABLE" | "REJECT";

interface UploadByteGateResult {
  status: UploadByteGateStatus;
  extension: string;
  expectedKinds: string[];
  actualKind: string;
  bytesInspected: number;
  reason: "signature-match" | "signature-mismatch" | "type-not-applicable" | "empty-bytes";
}

function assertUploadBytesReadable(
  fileName: string,
  bytes: Uint8Array | Buffer,
): UploadByteGateResult;
```

```text
MUST 只依赖 fileName 扩展名 + bytes 内容（不读路径、不调 SDK）。
MUST 可复用于未来 Chat / 其他附件消费者（本阶段仅 Knowledge 调用）。
MUST NOT 写盘、MUST NOT 网络、MUST NOT 改源文件。
```

## 3.3 Knowledge 挂接顺序

```text
filePath = managedPath || originalPath     // grilling Q8=A
bytes = await readFile(filePath)
gate = assertUploadBytesReadable(file.name, bytes)
if gate.status == REJECT:
  Job → failed
  errorCode = FILE_UPLOAD_CONTENT_UNREADABLE（或 Job 映射等价码）
  MUST NOT uploadBaseFile / addFileVersion HTTP
else:
  upload with the same bytes instance (or bitwise-identical copy)
```

`addFileVersion` MUST 使用同一 Gate。

---

# 4. STRICT 矩阵（本阶段）

## 4.1 Knowledge 必验（REJECT 可发生）

| Extension | Expected kind / rule |
|---|---|
| `pdf` | `%PDF-` within first 1024 bytes of **upload buffer** |
| `docx` / `xlsx` | ZIP local/end signature at buffer start (P0 ZIP rule) |
| `doc` / `xls` | OLE `D0 CF 11 E0 A1 B1 1A E1` at offset 0 |

空 buffer → REJECT。

## 4.2 NOT_APPLICABLE（本 Gate 不因内容拦截）

```text
pptx, ppt, images, txt/md/code, zip/archives, unknown, 其他
```

后续版本可将类型纳入同一模块；本 P0.1 MUST NOT 因扩大矩阵阻塞发布。

## 4.3 与 Import P0 的差异

| | Import P0 | Upload-Byte P0.1 |
|---|---|---|
| 输入 | 路径前缀 ≤16KiB | **完整上传 Buffer**（检验窗口同签名规则；MUST NOT 为 Gate 再读不同路径） |
| 时机 | hash 前 | **HTTP 前** |
| 权威性 | 预检 | **上传权威阻断** |
| 错误码 | `FILE_CONTENT_ENCRYPTED_OR_INVALID` | `FILE_UPLOAD_CONTENT_UNREADABLE` |

---

# 5. Requirements

## REQ-UBG-001 — Independent Upload-Byte Gate module

```text
MUST 新增 apps/work/src/main/files/upload-byte-gate.ts（名称可微调，职责不可变）。
MUST NOT 把 Gate 逻辑写入 knowledge-http-provider 或 Renderer。
MUST 复用/抽取 detectStrictContentKind 等签名 helper，避免复制粘贴漂移。
```

## REQ-UBG-002 — Knowledge HTTP zero-upload on REJECT

```text
MUST 在 runProviderUpload 调用 uploadBaseFile 之前执行 Gate。
MUST 在 addFileVersion 调用 HTTP 之前执行 Gate。
REJECT → MUST NOT 发起 Knowledge HTTP；Job status=failed。
PASS / NOT_APPLICABLE → 使用同一 bytes 上传。
```

## REQ-UBG-003 — Error code + UX

```text
MUST 新增 FILE_UPLOAD_CONTENT_UNREADABLE。
MUST Knowledge UI 提示语义：
  「内容无法作为声明类型读取，已禁止上传」
  （en i18n only in feature change）
MUST NOT 文案声称 confirmed Eisoo / 已确认亿赛通。
MUST NOT 再把该失败折叠成无提示的静默上传。
```

## REQ-UBG-004 — Import P0 retained

```text
MUST 保留 importOnePath 现有 Content Gate。
MUST NOT 本 PRD 删除 Chat P0 映射。
```

## REQ-UBG-005 — Observability

```text
MUST 记录 CONTENT_UPLOAD_CHECK 元数据事件：
  status, extension, expectedKinds, actualKind, bytesInspected, errorCode
MUST NOT 记录文件正文 / prefix hex / base64。
```

## REQ-UBG-006 — Chat / Eisoo out of scope

```text
MUST NOT 本阶段修改 Chat 上传路径。
MUST NOT 本阶段集成亿赛通 SDK（见 v2.0）。
```

---

# 6. Acceptance（CODE_RELEASE）

| ID | Given | Then |
|---|---|---|
| A-UBG-001 | upload buffer 为合法 `%PDF-` 的 pdf | Gate PASS；允许 upload mock 被调用 |
| A-UBG-002 | 扩展名 pdf，buffer 无 `%PDF-`（密文样貌） | REJECT；uploadBaseFile call count=0；Job failed；error=`FILE_UPLOAD_CONTENT_UNREADABLE` |
| A-UBG-003 | Import P0 曾 PASS 的路径，但 upload buffer 不可读 | 仍 REJECT（证明权威点在上传） |
| A-UBG-004 | docx 无 ZIP 签名 | REJECT；零 HTTP |
| A-UBG-005 | txt / md | NOT_APPLICABLE；不因本 Gate 拦截 |
| A-UBG-006 | addFileVersion 不可读 pdf bytes | REJECT；零 HTTP |
| A-UBG-007 | UI | 展示禁止上传文案；无 Eisoo confirmed |
| A-UBG-008 | 日志 | 无正文 marker |

Release：`A-UBG-001`–`A-UBG-008` + typecheck（本改动相关）必过。  
Field 亿赛通样本：SHOULD；不阻断本 P0.1 CODE_RELEASE（解密闭环属 v2.0）。

---

# 7. Plan 约束

Plan MUST 覆盖：

```text
NEW   upload-byte-gate.ts (+ tests)
MODIFY knowledge-job-runtime.ts
MODIFY register-knowledge-base-ipc.ts (addFileVersion)
MODIFY file-errors.ts
MODIFY KnowledgeUploadPanel + en knowledge i18n
MODIFY/NEW tests: runtime upload gate + addFileVersion
```

Plan MUST NOT：

```text
改 Chat composer 上传语义
引入亿赛通 native
明文落盘
删除 Import P0
扩大 STRICT 到 pptx/images（除非另开 PRD）
```

仅当 metadata `status=APPROVED_FOR_PLAN` 后允许生成 `.plan.md`。

当前状态：`APPROVED_FOR_PLAN`（2026-09-21 Shared Understanding 已确认）。

---

# 8. Grilling Shared Understanding Lock

```text
CONFIRMED: 2026-09-21 by product owner
```

```text
Q1=A  透明解密假 PASS；上传字节不可读仍上传
Q2=C  双闸；Upload-Byte 权威阻断
Q3=A  Layer-1 平台门禁 + Layer-2 亿赛通（v2，不改其文）
Q4=C  同发；禁传为硬门槛；Eisoo 可后开
Q5=C  Layer-1 验 Buffer；required 才强制 Layer-2
Q6=C  runProviderUpload + addFileVersion 等全部 Knowledge bytes→HTTP
Q7=A  新模块 files/upload-byte-gate.ts
Q8=A  managedPath || originalPath
Q9=B  本短 PRD；不改 v2.0 正文
Q10=A 「无法按类型读取，已禁止上传」
Q11=A Chat 本阶段不动
Q12=A 本文件（现已 APPROVED_FOR_PLAN）
Q13=A Import P0 保留
Q14=B FILE_UPLOAD_CONTENT_UNREADABLE
Q15=C Knowledge 必验 pdf/doc/docx/xls/xlsx；其余 NOT_APPLICABLE
Q16=B 起草本 PRD
```

Frontier: EMPTY. Shared Understanding: CONFIRMED.
