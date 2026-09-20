---
title: "smc-copilot File Import P0 明文可读性校验 PRD"
subtitle: "Protected / Encrypted Document Readability Gate for File Platform"
prd_id: "PRD-WORK-FILE-PROTECTED-CONTENT-P0"
version: "1.1"
status: "APPROVED_FOR_PLAN"
product: "SMC Copilot Work Desktop"
repository: "https://github.com/loudon84/smc-copilot"
branch: "main"
baseline_sha: "e098f3f0c1bb09d80706fc4ded7122b68e55fb1d"
owner: "SMC Copilot / Work File Platform"
reviewers:
  - "Work Desktop Architect"
  - "File Platform Owner"
  - "Knowledge Module Owner"
created_at: "2026-09-20"
updated_at: "2026-09-20"
approved_at: "2026-09-20"
approval_basis: "grilling Round1-3 shared understanding locked"
target_release: "P0"
change_type:
  - "BROWNFIELD_CHANGE"
  - "BUGFIX"
  - "ARCHITECTURE_CHANGE"
golden_consumer:
  - "apps/work Chat Composer file attachment"
  - "apps/work Knowledge file upload"
related_docs:
  - "需求PRD工程模板.md"
  - "亿赛通文档加解密.md"
  - "apps/work/src/main/files/file-security.ts"
  - "apps/work/src/main/files/file-import-service.ts"
  - "apps/work/src/main/files/file-service.ts"
  - "apps/work/src/main/knowledge/knowledge-job-runtime.ts"
  - "apps/work/src/renderer/src/screens/Knowledge/features/file-job/KnowledgeUploadPanel.tsx"
supersedes: "NONE"
---

# smc-copilot File Import P0 明文可读性校验 PRD

> 本 PRD 严格按《需求PRD工程模板》编写。
>
> 本版本只解决 **P0：本地文件进入 File Platform 前的“可读明文内容门禁”**。
>
> 本版本 **不集成亿赛通 Windows SDK，不直接判断厂商密文格式，不做解密**；它只回答一个工程问题：
>
> **smc-copilot Main Process 当前实际读到的文件内容，是否与该文件声明类型一致、是否具备继续进入 Chat / Knowledge 流程的基本明文特征。**
>
> **v1.1 grilling 锁定：** P0 ship 成功标准是工程门禁（扩展名 ↔ 强签名）；现场亿赛通根因尚未用受保护样本验证。`CODE_RELEASE` 与 `FIELD_EVIDENCE`/`Spike` 分离；未完成 Spike 前 MUST NOT 将本能力标为 `VERIFIED`。

---

# 0. PRD 使用原则

## 0.1 本 PRD 的职责

本 PRD 必须唯一确定：

```text
WHY        为什么增加文件内容门禁
WHAT       P0 要增加什么能力
BOUNDARY   P0 检测什么 / 不检测什么
STATE      检测结果以什么为事实源
INPUT      输入文件与上下文是什么
OUTPUT     返回什么结果 / 错误码
SIDE EFFECT 检测通过与失败分别允许什么副作用
FAILURE    读取失败 / 内容不匹配如何处理
ACCEPTANCE 如何证明密文/异常文件没有进入后续流程
EVIDENCE   用什么测试、日志与摘要证明实现有效
```

## 0.2 强制规范关键词

本文使用：

```text
MUST
MUST NOT
SHOULD
SHOULD NOT
MAY
```

所有 `MUST / MUST NOT` 均映射到 Acceptance。

## 0.3 No-Inference Rule

实现或 Plan Agent 遇到本文未定义的以下事项时：

```text
文件类型匹配规则
是否阻断
检测位置
读取字节范围
失败副作用
Knowledge Job 行为
Chat Attachment 行为
日志可记录内容
错误码
```

必须：

```text
MUST report SPEC_SEMANTIC_GAP
MUST BLOCK plan generation
MUST NOT 自行改变本文定义的 Gate 行为
```

---

# 1. 文档元数据

```yaml
title: smc-copilot File Import P0 明文可读性校验 PRD
prd_id: PRD-WORK-FILE-PROTECTED-CONTENT-P0
version: 1.1
status: APPROVED_FOR_PLAN
product: SMC Copilot Work Desktop
repository: https://github.com/loudon84/smc-copilot
branch: main
baseline_sha: e098f3f0c1bb09d80706fc4ded7122b68e55fb1d
owner: Work File Platform
created_at: 2026-09-20
updated_at: 2026-09-20
approved_at: 2026-09-20
approval_basis: grilling Round1-3 shared understanding locked
target_release: P0
change_type:
  - BROWNFIELD_CHANGE
  - BUGFIX
  - ARCHITECTURE_CHANGE
golden_consumer:
  - Chat Composer file attachment
  - Knowledge file upload
```

### Baseline Source Files

| File | Baseline Role |
|---|---|
| `apps/work/src/main/files/file-service.ts` | `pickFiles()` / `importDroppedFiles()` 入口 |
| `apps/work/src/main/files/file-import-service.ts` | `importOnePath()` 统一本地路径导入流水线 |
| `apps/work/src/main/files/file-security.ts` | 已存在 `detectMagicKind()`、路径与类型策略 |
| `apps/work/src/shared/files/file-errors.ts` | File Platform 错误码契约 |
| `apps/work/src/main/knowledge/knowledge-job-runtime.ts` | Knowledge 当前 `readFile(filePath)` 后上传 bytes |
| `apps/work/src/renderer/src/screens/Chat/composerFilePlatform.ts` | Chat FileImportResult → Attachment/Error |
| `apps/work/src/renderer/src/screens/Knowledge/features/file-job/KnowledgeUploadPanel.tsx` | Knowledge picker + failed import draft cancel |

---

# 2. 一句话目标

让 **smc-copilot Work Desktop 的 Chat 与 Knowledge 本地文件导入**，在用户通过系统文件选择器或本地路径拖拽选择文件后、文件进入 hash / managed storage / association / parse / Knowledge enqueue 之前，通过 **Main Process 明文可读性 Gate** 验证受支持的强特征文档类型，阻止“当前进程读到的是密文或与扩展名不匹配的异常内容”继续流入后续业务链路，同时保持现有文件导入兼容性和零厂商 SDK 依赖。

---

# 3. 背景与问题定义

## 3.1 Current State

### 3.1.1 当前统一文件选择链路

当前 `fileService.pickFiles()`：

```text
Electron dialog.showOpenDialog()
  ↓
result.filePaths[]
  ↓
importOnePath(path, pickerContext)
```

`importDroppedFiles()` 同样进入 `importOnePath()`。

### 3.1.2 当前 `importOnePath()` 顺序

当前主流程为：

```text
resolveImportConsumer
  ↓
resolveAndValidate(path)
  ↓
readFileSize
  ↓
assertImportAllowed(extension + size)
  ↓
hashOrError(full file)
  ↓
findByHash
  ↓
optional storeManagedCopy
  ↓
upsertManagedFile
  ↓
scheduleParseAfterImport
  ↓
insertAssociation
  ↓
Knowledge: bindJobManagedFile + enqueue
```

当前缺失：

```text
“文件内容是否与声明类型一致 / 当前进程是否实际读到了可识别明文” Gate
```

### 3.1.3 已存在能力

`file-security.ts` 已存在：

```ts
detectMagicKind(buf: Buffer)
```

当前能够识别：

```text
pdf
image: PNG / JPEG / GIF / WEBP
zip
text heuristic
unknown
```

但 `importOnePath()` 当前没有在 mutation 前调用内容 Gate。

### 3.1.4 Knowledge 当前行为

Knowledge Provider runtime 当前已经执行：

```text
file.managedPath || file.originalPath
  ↓
fs/promises.readFile(filePath)
  ↓
bytes
  ↓
uploadBaseFile(bytes)
```

因此问题不是“Knowledge 完全没有 readFile”，而是：

```text
文件在进入 File Platform 时没有先确认
smc-copilot 实际读到的是不是可识别明文。
```

### 3.1.5 亿赛通环境事实

已有企业终端环境使用亿赛通文档加密。已知业务现象：

```text
smc-copilot.exe 被配置为可访问文档
但上传到 Knowledge 服务后仍可能得到不可解析内容
```

亿赛通提供厂商密文判断与流判断接口，但现有文档对应中间件 SO / Linux 集成方式；本 P0 不把该接口引入 Windows Electron 客户端。

## 3.2 Problem

### P-001 — 缺少内容级入口门禁

当前 File Platform 只校验：

```text
路径
扩展名 deny list
文件大小
```

没有验证：

```text
.pdf 是否能读到 PDF 明文标识
.docx/.xlsx/.pptx 是否能读到 ZIP/OOXML 容器标识
.doc/.xls/.ppt 是否能读到 OLE Compound File 标识
常见图片是否能读到对应图片标识
```

导致密文或异常内容可以继续：

```text
hash
→ managed copy
→ ManagedFile
→ association
→ parse
→ Knowledge upload / Chat attachment
```

### P-002 — 错误发生过晚

如果密文直到 Knowledge Server / Parser 才失败：

```text
错误定位困难
服务端收到无效内容
本地 ManagedFile / Association 已创建
Knowledge Job 已进入上传/解析状态
```

### P-003 — 无法快速区分“DLP 读取问题”与“服务端解析问题”

缺少客户端读取后的内容指纹/格式检测，导致现场无法明确：

```text
A. smc-copilot Main read 已经得到密文
B. managed copy 后变成异常内容
C. HTTP 传输发生变化
D. 服务端 parser 问题
```

## 3.3 Impact

```text
业务影响：
- Knowledge 上传显示失败或文件不可解析。
- Chat 附件可能把不可读路径继续交给后续 Agent / Parser。

工程影响：
- 密文问题晚到 Parser / Server 才暴露，排障链路过长。
- 无统一 File Platform 内容门禁。

安全影响：
- 无法在客户端最小边界阻止不可识别内容离开当前导入流程。
- 可能把不符合预期格式的文件发送到 Knowledge 服务。

运维影响：
- 现场无法通过客户端日志判断 readFile 后内容类型。

AI Coding 影响：
- 后续 Agent 容易在 Chat / Knowledge 各自追加临时判断，造成重复实现和 Owner 分裂。
```

---

# 4. Scope

## 4.1 In Scope

```text
SCOPE-001
在 Main Process 的 importOnePath() 中加入统一 File Content Readability Gate。
映射：REQ-PFC-001。

SCOPE-002
Gate MUST 位于路径/大小/deny-extension 校验之后，hash 与所有持久化/复制/association/enqueue 之前。
映射：REQ-PFC-001、REQ-PFC-004。

SCOPE-003
P0 对具有稳定二进制签名的文档类型执行强校验：
pdf, docx, xlsx, pptx, ods, epub, doc, xls, ppt,
png, jpg, jpeg, gif, webp, bmp。
映射：REQ-PFC-002。

SCOPE-004
P0 对文本类、代码类、SVG、未知类型不做“密文判定”，保持现有导入兼容性。
映射：REQ-PFC-003。

SCOPE-005
校验失败 MUST 返回 FILE_CONTENT_ENCRYPTED_OR_INVALID，且禁止 hash 后的所有业务副作用。
映射：REQ-PFC-004。

SCOPE-006
Chat picker 与 drag/drop 本地路径导入自动获得该 Gate。
映射：REQ-PFC-005。

SCOPE-007
Knowledge picker 自动获得该 Gate；失败时保持现有 UI 行为：取消刚创建的 draft Job，不 enqueue、不上传。
映射：REQ-PFC-006。

SCOPE-008
增加安全可观测日志，仅记录元数据、检测结果和摘要，不记录文档正文。
映射：REQ-PFC-007。

SCOPE-009
为 P0 增加单元测试、集成测试、Negative Acceptance 和 Release Evidence。
映射：REQ-PFC-001 ~ REQ-PFC-007。
```

## 4.2 Out of Scope

```text
NON-GOAL-001
P0 MUST NOT 集成亿赛通 Windows DLL / SDK / COM / Native Addon。

NON-GOAL-002
P0 MUST NOT 调用 EstIsEncryptLockFile / EstIsEncryptBuffer / 解密接口。

NON-GOAL-003
P0 MUST NOT 声称 FILE_CONTENT_ENCRYPTED_OR_INVALID 等价于“100% 已确认亿赛通密文”。
该错误只表示：当前读取内容未满足声明格式的 P0 明文特征。

NON-GOAL-004
P0 MUST NOT 对文件执行解密、重新加密或持久化明文副本。

NON-GOAL-005
P0 MUST NOT 修改 Knowledge Server / RAGFlow / Knowledge Gateway 的上传协议。

NON-GOAL-006
P0 MUST NOT 改变现有 ManagedFile contentHash 算法与 hash scope。

NON-GOAL-007
P0 MUST NOT 对 Clipboard Blob 引入 DLP 检测。
Clipboard 路径当前走 stageClipboardImport()，不在本 P0 Gate 范围。

NON-GOAL-008
P0 MUST NOT 因无法可靠识别文本编码而阻断 md/txt/html/json/csv/code/svg 等文本类文件。

NON-GOAL-009
P0 MUST NOT 将 ZIP magic 通过解释为“OOXML 语义完全合法”。
P0 只证明输入是可识别的明文 ZIP 容器，不替代 Parser 验证。

NON-GOAL-010
P0 MUST NOT 负责 Gate PASS 之后的二次 `readFile` / managed copy / Knowledge upload 字节一致性（TOCTOU / DLP 滤镜差异）。
该风险见 Appendix D Residual Risk 与 Appendix E P0.1 Escalate。
```

## 4.3 Architecture Boundary

| Domain | Owner | Input | Output | 不负责 |
|---|---|---|---|---|
| File Selection | `file-service.ts` | User picker / dropped paths | local path list | 内容解析 |
| File Path Import | `file-import-service.ts` | canonical path + context | `FileImportResult` | 厂商解密 |
| Content Gate | `protected-file-detector.ts` | canonical path + filename | validation result | 文档正文解析 |
| Magic Detection | `file-security.ts` | prefix Buffer | content kind | 厂商密文识别 |
| Managed File | existing File Platform | validated file | ManagedFile / association | 修复异常文件 |
| Chat Consumer | `composerFilePlatform.ts` | FileImportResult | Attachment / error | 解密 |
| Knowledge Consumer | KnowledgeUploadPanel + Job Runtime | FileImportResult / ManagedFile | Upload Job / bytes | 客户端解密 |

---

# 5. Terminology / Domain Model

```text
Canonical Path
经过 defaultFilePathPolicy.resolveAndValidate() 后得到的 realPath。

Declared Type
由文件名扩展名声明的文件类型。

Content Kind
由文件前缀字节识别出的物理格式类型。

Strong-Signature Type
存在稳定二进制签名、P0 可低歧义判断的类型。

Plaintext Readability
smc-copilot Main Process 从文件路径读取的字节符合该 Declared Type 的 P0 内容特征。

VALID_PLAINTEXT
受 P0 强校验的文件，读取内容满足声明类型的签名规则。

INVALID_OR_ENCRYPTED
受 P0 强校验的文件，读取成功但内容签名与声明类型不匹配。
该状态不等价于厂商级“已确认加密”。

NOT_APPLICABLE
当前类型不属于 P0 强校验范围，保持原有流程。

READ_FAILED
Gate 无法读取前缀字节。

Content Gate
在 File Platform 第一次 mutation 之前执行的读取与格式匹配校验。

Mutation
包括 managed copy、ManagedFile upsert、parse schedule、association、Knowledge bind/enqueue 等可观察副作用。
```

---

# 6. System Context

## 6.1 Context Diagram

```text
User
  ↓
Chat Picker / Knowledge Picker / Drag & Drop
  ↓
Electron Main fileService
  ↓
importOnePath(canonical path)
  ↓
┌────────────────────────────────┐
│ File Content Readability Gate  │
│ protected-file-detector.ts     │
└────────────────────────────────┘
  ↓ PASS / NOT_APPLICABLE
Existing File Platform
  ↓
ManagedFile / Association / Parse
  ↓                         ↓
Chat Attachment          Knowledge Job
                           ↓
                    readFile → HTTP Upload

Gate FAIL
  ↓
FileImportResult.error
  ↓
No File Platform mutation / No Knowledge upload
```

## 6.2 System Boundary

```text
Inside boundary:
- apps/work Electron Main File Platform
- Chat File Platform adapter
- Knowledge upload picker integration
- File import errors
- local structured logs

Outside boundary:
- 亿赛通 Windows native SDK
- 亿赛通服务端
- Knowledge Server / RAGFlow parser
- Hermes Agent 对 path-ref 的后续打开行为

External dependency:
- Node.js fs APIs
- Electron Main Process
- existing File Platform contracts

Trusted input:
- File Platform configuration loaded through existing config path
- canonical path produced by existing path policy

Untrusted input:
- user-selected local file bytes
- filename extension
- dropped path
```

---

# 7. Authoritative State / Source of Truth

P0 检测结果 **不持久化**，属于本次 import operation 的 Runtime / Observed State。

| State | Role | Authoritative? | Writer | Reader | 可否自动覆盖 |
|---|---|---:|---|---|---:|
| canonical path | `RESOLVED_STATE` | YES | Path Policy | Content Gate / import | NO |
| declared extension | `OBSERVED_STATE` | YES for declared type | filename | Content Gate | NO |
| prefix bytes | `OBSERVED_STATE` | YES for current process read | Node fs | Content Gate | N/A |
| content kind | `RESOLVED_STATE` | YES for P0 matching | Detector | import | N/A |
| validation status | `RUNTIME_STATE` | YES for this operation | Detector | import | N/A |
| FileImportResult | `RUNTIME_STATE` | YES for caller | importOnePath | Renderer | NO |
| ManagedFile | existing persistent state | YES after PASS only | File Platform store | consumers | existing rules |
| evidence log | `EVIDENCE_STATE` | YES for test/run evidence | logger/test | reviewer | append-only by run |

规则：

```text
P0 MUST NOT 新增数据库字段保存 encrypted=true/false。
P0 MUST NOT 将 heuristic detection 结果升级为长期业务事实。
```

---

# 8. State Machine

## 8.1 Import Content Gate State

```text
UNVALIDATED
   ↓ canonical path + type policy pass
READING_PREFIX
   ├─ read error ─────────→ READ_FAILED
   ↓ read success
CLASSIFYING
   ├─ type not in P0 scope → NOT_APPLICABLE
   ├─ expected == actual ─→ VALID_PLAINTEXT
   └─ expected != actual ─→ INVALID_OR_ENCRYPTED
```

## 8.2 Allowed Transitions

| Before | Event | After | Next Action |
|---|---|---|---|
| UNVALIDATED | prefix read | READING_PREFIX | no mutation |
| READING_PREFIX | read error | READ_FAILED | return `FILE_READ_FAILED` |
| READING_PREFIX | read success | CLASSIFYING | classify |
| CLASSIFYING | unsupported validation type | NOT_APPLICABLE | existing import continues |
| CLASSIFYING | signature match | VALID_PLAINTEXT | existing import continues |
| CLASSIFYING | signature mismatch | INVALID_OR_ENCRYPTED | return new error |

## 8.3 Illegal Transitions

```text
INVALID_OR_ENCRYPTED → hash/store/upsert/association/enqueue MUST NOT occur.
READ_FAILED → hash/store/upsert/association/enqueue MUST NOT occur.
```

## 8.4 Persistence

```text
Gate state persistence: NONE
Error propagation: FileImportResult.error
Evidence persistence: tests / application log only
```

---

# 9. Data / Schema Contract

## 9.1 Schema — `FileContentValidationResult`

```ts
type FileContentValidationStatus =
  | "VALID_PLAINTEXT"
  | "INVALID_OR_ENCRYPTED"
  | "NOT_APPLICABLE";

type FileContentKind =
  | "pdf"
  | "zip"
  | "ole"
  | "png"
  | "jpeg"
  | "gif"
  | "webp"
  | "bmp"
  | "unknown";

interface FileContentValidationResult {
  status: FileContentValidationStatus;
  extension: string;
  expectedKinds: FileContentKind[];
  actualKind: FileContentKind;
  bytesInspected: number;
  reason:
    | "signature-match"
    | "signature-mismatch"
    | "type-not-applicable";
}
```

Schema rules：

```text
schema id: smc.work.file-content-validation
version: 1
required fields: all
additionalProperties: false
persistence: NONE
compatibility: internal Main-only type
migration: NONE
```

## 9.2 Field Semantic Table

| Field | Type | Required | Default | Authority | Meaning |
|---|---|---:|---|---|---|
| status | enum | YES | none | Detector | Gate decision |
| extension | string | YES | `""` | filename | normalized lowercase extension |
| expectedKinds | array | YES | `[]` | P0 matrix | declared type accepted kinds |
| actualKind | enum | YES | `unknown` | prefix bytes | physically detected kind |
| bytesInspected | number | YES | 0 | fs read | bytes actually inspected |
| reason | enum | YES | none | Detector | deterministic decision reason |

## 9.3 P0 Validation Matrix

### Strong Gate Types

| Declared Extension | Expected Content Kind | Signature Rule | Gate |
|---|---|---|---|
| `pdf` | `pdf` | `%PDF-` MUST occur within first 1024 bytes | STRICT |
| `docx` | `zip` | ZIP local/end/data-descriptor signature | STRICT |
| `xlsx` | `zip` | ZIP signature | STRICT |
| `pptx` | `zip` | ZIP signature | STRICT |
| `ods` | `zip` | ZIP signature | STRICT |
| `epub` | `zip` | ZIP signature | STRICT |
| `doc` | `ole` | `D0 CF 11 E0 A1 B1 1A E1` at offset 0 | STRICT |
| `xls` | `ole` | same | STRICT |
| `ppt` | `ole` | same | STRICT |
| `png` | `png` | PNG signature | STRICT |
| `jpg` / `jpeg` | `jpeg` | `FF D8 FF` | STRICT |
| `gif` | `gif` | `GIF87a` or `GIF89a` | STRICT |
| `webp` | `webp` | `RIFF....WEBP` | STRICT |
| `bmp` | `bmp` | `42 4D` (`BM`) | STRICT |

### Compatibility / Non-Blocking Types

以下类型 P0 返回 `NOT_APPLICABLE`，MUST NOT 因内容 Gate 阻断：

```text
md, markdown, mdx
html, htm
svg
txt, text, log, csv, tsv, ini, env
json, yaml, yml, toml, xml
代码类扩展名
zip, tar, gz, tgz, rar, 7z
unknown
```

理由：P0 目标是低误杀率地阻断明显密文/异常二进制文档；文本编码与通用 archive 的可靠性验证属于后续版本。

## 9.4 Prefix Read Contract

```text
MAX_PREFIX_BYTES = 16 * 1024

MUST:
- 通过 Node fs/promises.open + read 读取。
- 从 offset 0 开始。
- 最多读取 16384 bytes。
- 文件小于 16384 时读取实际文件长度。
- 读取完成 MUST close handle。

MUST NOT:
- 为 Gate 读取整个文件。
- 将 prefix bytes 输出到日志。
- 生成临时明文文件。
```

---

# 10. Requirement Unit

## REQ-PFC-001 — Unified Content Gate Placement

### Goal

确保所有本地路径型文件在 File Platform 第一次 mutation 前经过同一内容 Gate。

### Normative Requirement

```text
MUST 在 importOnePath() 内执行 Content Gate。
MUST 在 canonical path、size、assertImportAllowed 成功后执行。
MUST 在 hashOrError() 之前执行。
MUST 由 picker 与 drag-drop 共用。
MUST NOT 在 Chat / Knowledge 页面分别复制检测逻辑。
```

### Inputs

```text
canonicalPath: string
filename: basename(canonicalPath)
context: FileImportContext
```

### Preconditions

```text
PRE-001 path policy 已成功解析 realPath。
PRE-002 文件存在且 size 可读取。
PRE-003 extension / size 未被现有 assertImportAllowed 阻断。
```

### Authoritative State

```text
SOT: canonical path + prefix bytes
Observed: declared extension
Derived: validation result
```

### State Transition

```text
Before: file 尚未进入 hash / store / DB association
Event: validateFileContent(canonical, name)
After: PASS / NOT_APPLICABLE / FAIL
```

### Allowed Side Effects

```text
ALLOW:
- read up to 16 KiB from source file
- local diagnostic log
```

### Forbidden Side Effects

```text
DENY:
- DB write
- managed file write
- temp file write
- association write
- parse enqueue
- Knowledge enqueue
- network request
```

### Ownership Scope

```text
FILE READ ONLY
```

### Idempotency

```text
first run: same unchanged file → same result
second run: same unchanged file → same result
```

### Failure Semantics

```text
F-001:
trigger: prefix read fails
expected state: no mutation
error code: FILE_READ_FAILED
rollback: none required because no mutation occurred
retryable: false for this operation
```

### Postconditions

```text
POST-001 FAIL 时 hashOrError() 未被调用。
POST-002 PASS/NOT_APPLICABLE 时继续现有 import pipeline。
```

### Invariants

```text
INV-PFC-001 Gate MUST precede first File Platform mutation.
INV-PFC-002 Gate MUST be Main-owned and consumer-agnostic.
```

### Error Codes

```text
FILE_READ_FAILED
FILE_CONTENT_ENCRYPTED_OR_INVALID
```

### Acceptance

```text
A-PFC-001
A-PFC-002
A-PFC-007
```

### Evidence

```text
required test: protected-file-detector + importOnePath integration tests
required artifact: vitest output
required digest: source file SHA256 before/after equal
required runtime output: FileImportResult
```

---

## REQ-PFC-002 — Strong Binary Plaintext Validation

### Goal

对具有稳定签名的文档类型判断“当前 Main Process 读取内容是否符合声明类型”。

### Normative Requirement

```text
MUST 按 9.3 P0 Validation Matrix 进行匹配。
MUST 将签名匹配返回 VALID_PLAINTEXT。
MUST 将签名不匹配返回 INVALID_OR_ENCRYPTED。
MUST 将 INVALID_OR_ENCRYPTED 映射到 FILE_CONTENT_ENCRYPTED_OR_INVALID。
MUST NOT 将该结果记录为“confirmed eisoo encrypted”。
```

### Inputs

```text
filename extension
prefix Buffer
```

### Preconditions

```text
PRE-001 prefix read 成功。
PRE-002 extension 属于 STRICT matrix。
```

### Authoritative State

```text
SOT: prefix bytes
Observed: extension
Derived: actualKind + expectedKinds
```

### State Transition

```text
CLASSIFYING → VALID_PLAINTEXT
or
CLASSIFYING → INVALID_OR_ENCRYPTED
```

### Allowed Side Effects

```text
ALLOW: NONE except local diagnostic log
```

### Forbidden Side Effects

```text
DENY: content mutation, decryption, temp plaintext, network
```

### Ownership Scope

```text
NONE — detector does not own source file bytes
```

### Idempotency

```text
same bytes + same filename → same result
```

### Failure Semantics

```text
F-002:
trigger: declared STRICT type does not match content signature
expected state: import blocked
error code: FILE_CONTENT_ENCRYPTED_OR_INVALID
rollback: none
retryable: false
```

### Postconditions

```text
POST-002-001 Matching binary document may proceed.
POST-002-002 Mismatch document MUST stop before hash.
```

### Invariants

```text
INV-PFC-003 Detector decision MUST depend only on filename extension + prefix bytes.
INV-PFC-004 No vendor-specific encryption label may be inferred.
```

### Error Codes

```text
FILE_CONTENT_ENCRYPTED_OR_INVALID
```

### Acceptance

```text
A-PFC-001 ~ A-PFC-006
A-PFC-002b
A-PFC-012
```

### Goal

避免 P0 因文本编码、SVG 或未知类型造成大范围兼容性回归。

### Normative Requirement

```text
MUST 对 9.3 Compatibility / Non-Blocking Types 返回 NOT_APPLICABLE。
MUST NOT 因 Content Gate 阻断这些类型。
MUST 继续执行现有 assertImportAllowed、hash、parse 和 consumer 流程。
```

### Inputs

```text
filename extension
```

### Preconditions

```text
现有 path / size / deny-extension policy 已通过。
```

### Authoritative State

```text
SOT: P0 applicability matrix
```

### State Transition

```text
CLASSIFYING → NOT_APPLICABLE → existing pipeline
```

### Allowed Side Effects

```text
Existing pipeline side effects after NOT_APPLICABLE.
```

### Forbidden Side Effects

```text
MUST NOT 新增基于文本 heuristic 的 hard block。
```

### Ownership Scope

```text
NONE
```

### Idempotency

```text
unchanged extension → same applicability
```

### Failure Semantics

```text
No P0-specific failure for NOT_APPLICABLE.
```

### Postconditions

```text
POST-003-001 Existing text / code workflow remains behaviorally compatible.
```

### Invariants

```text
INV-PFC-005 P0 hard block only applies to STRICT matrix.
```

### Acceptance

```text
A-PFC-006
```

### Evidence

```text
text fixtures imported successfully
```

---

## REQ-PFC-004 — Zero-Mutation Failure Semantics

### Goal

密文/异常文档在客户端最早边界失败，不污染 File Platform 与 Knowledge 状态。

### Normative Requirement

```text
MUST 新增 FileErrorCode FILE_CONTENT_ENCRYPTED_OR_INVALID。
MUST 在 mismatch 时返回 FileImportResult { ok:false }。
MUST NOT 计算 content hash。
MUST NOT storeManagedCopy。
MUST NOT upsertManagedFile。
MUST NOT scheduleParseAfterImport。
MUST NOT insertAssociation。
MUST NOT bindJobManagedFile。
MUST NOT enqueue Knowledge Job。
MUST NOT 发起 Knowledge 上传 HTTP。
```

### Inputs

```text
INVALID_OR_ENCRYPTED result
```

### Preconditions

```text
Gate read 成功，签名 mismatch。
```

### Authoritative State

```text
SOT: Gate decision
```

### State Transition

```text
UNVALIDATED → INVALID_OR_ENCRYPTED → import rejected
```

### Allowed Side Effects

```text
ALLOW: local log + FileImportResult return
```

### Forbidden Side Effects

见 Normative Requirement。

### Ownership Scope

```text
NONE
```

### Idempotency

```text
Repeated mismatch import → repeated reject, zero managed state accumulation.
```

### Failure Semantics

```text
F-004:
trigger: signature mismatch
expected state: zero File Platform mutation
error code: FILE_CONTENT_ENCRYPTED_OR_INVALID
rollback: none
retryable: false
```

### Postconditions

```text
POST-004-001 no ManagedFile exists for rejected import operation.
POST-004-002 no association exists for rejected import operation.
POST-004-003 no Knowledge remote request caused by rejected import.
```

### Invariants

```text
INV-PFC-006 rejected content MUST NOT cross File Platform mutation boundary.
```

### Acceptance

```text
A-PFC-002
A-PFC-004
A-PFC-008
A-PFC-009
```

### Evidence

```text
store spy call count = 0
knowledge upload mock call count = 0
```

---

## REQ-PFC-005 — Chat Consumer Behavior

### Goal

让 Chat 用户在附件入口立即得到失败，而不是创建不可用 Attachment。

### Normative Requirement

```text
MUST 复用 FileImportResult.error。
MUST 在 composerFilePlatform.ts 将 FILE_CONTENT_ENCRYPTED_OR_INVALID 映射为 read-failed AttachmentError。
MUST 将可操作 FileError.message 保留在 platformErrors。
MUST 通过 `locales/en` i18n key 提供用户可见提示（不得在本变更中新增/编辑非 en locale）。
MUST 用户文案语义覆盖：内容与声明类型不符，或可能受文档保护；请使用明文可读副本重试。
MUST NOT 在用户文案中声称 “confirmed Eisoo / 已确认亿赛通加密”。
MUST NOT 为 rejected file 调用 files.toAttachments。
MUST NOT 为 rejected file 增加 attachment slot usage。
MUST NOT 新增 AttachmentError code（保持 read-failed）。
```

### Inputs

```text
FileImportResult[]
```

### Preconditions

```text
Chat picker / drag-drop 使用 File Platform。
```

### Authoritative State

```text
SOT: FileImportResult
```

### State Transition

```text
selected → rejected → no attachment
```

### Allowed Side Effects

```text
Renderer error state update
```

### Forbidden Side Effects

```text
Attachment creation for rejected file
```

### Ownership Scope

```text
ENTRY — current selected file result only
```

### Idempotency

```text
Repeated same invalid selection → same error behavior
```

### Failure Semantics

```text
F-005:
trigger: FILE_CONTENT_ENCRYPTED_OR_INVALID
expected state: 0 attachment for that file
error code: mapped read-failed + platformErrors message
rollback: none
retryable: user may select a different/readable copy
```

### Postconditions

```text
POST-005-001 valid files in same multi-select batch remain importable.
POST-005-002 invalid file does not consume attachment slot.
```

### Invariants

```text
INV-PFC-007 One invalid item MUST NOT fail valid siblings in pickFiles batch.
```

### Acceptance

```text
A-PFC-007
A-PFC-009
```

### Evidence

```text
Composer ingest unit test
```

---

## REQ-PFC-006 — Knowledge Consumer Behavior

### Goal

阻止不符合明文特征的文件进入 Knowledge upload / ingestion。

### Normative Requirement

```text
MUST 通过现有 files.pickFiles → importOnePath 获得 Gate。
MUST NOT 在 KnowledgeUploadPanel 复制 Magic 检测。
MUST 保持现有行为：若本次单文件 pick 未产生任何 ok result，则 cancel draft Job。
MUST 在 import 失败路径向用户展示与 Chat 同语义的可操作提示（`locales/en` i18n；MUST NOT 声称已确认亿赛通）。
MUST NOT bind managed_file_id for rejected file。
MUST NOT enqueue provider runtime。
MUST NOT execute knowledge-job-runtime readFile/uploadBaseFile for rejected file。
```

### Inputs

```text
Knowledge draft job id
FileImportResult
```

### Preconditions

```text
Knowledge Base 已锁定
createDraft 成功
pickFiles single-file
```

### Authoritative State

```text
SOT: FileImportResult
Derived UI state: cancelled Job when no imported file
```

### State Transition

```text
DRAFT
  ↓ select invalid/encrypted-looking file
CANCELLED
```

### Allowed Side Effects

```text
Knowledge draft creation already occurs before picker。
Failure path允许 cancel 该 draft。
```

### Forbidden Side Effects

```text
No managed file bind
No enqueue
No provider HTTP upload
```

### Ownership Scope

```text
RECORD — the newly created draft Job only
```

### Idempotency

```text
Each picker attempt owns its own draft; failed attempt ends CANCELLED.
```

### Failure Semantics

```text
F-006:
trigger: imported.length === 0 due to Content Gate rejection
expected state: draft cancelled
error code: file import error remains FILE_CONTENT_ENCRYPTED_OR_INVALID
rollback: cancel draft only
retryable: new upload attempt creates new draft
```

### Postconditions

```text
POST-006-001 rejected file bytes never reach Knowledge HTTP provider.
```

### Invariants

```text
INV-PFC-008 Knowledge client-side content rejection MUST occur before provider upload.
```

### Acceptance

```text
A-PFC-008
```

### Evidence

```text
KnowledgeUploadPanel test + provider spy
```

---

## REQ-PFC-007 — Safe Observability

### Goal

支持亿赛通现场排障，同时不泄露文档内容。

### Normative Requirement

```text
MUST 记录 content gate structured event。
MUST 记录：operation id、stage、status、extension、expectedKinds、actualKind、bytesInspected、errorCode、timestamp。
SHOULD 记录 basename；MUST NOT 记录文件正文。
MUST NOT 记录 prefix hex dump。
MUST NOT 记录完整文件 bytes / base64。
MUST NOT 通过网络 telemetry 上传文档内容。
```

### Inputs

```text
validation metadata
```

### Preconditions

```text
Content Gate invoked
```

### Authoritative State

```text
SOT: runtime validation result
```

### State Transition

```text
validation completed → evidence log emitted
```

### Allowed Side Effects

```text
local application log append
```

### Forbidden Side Effects

```text
content log
network telemetry containing content
```

### Ownership Scope

```text
ENTRY — one log event per checked file
```

### Idempotency

```text
Each operation may append one event; repeated operation generates a new operation id.
```

### Failure Semantics

```text
F-007:
trigger: logger unavailable
expected state: Gate decision remains authoritative; import result MUST NOT change solely because log write failed
error code: none propagated to user
rollback: none
retryable: no
```

### Postconditions

```text
POST-007-001 no content bytes appear in logs.
```

### Invariants

```text
INV-PFC-009 Observability MUST NOT become a plaintext exfiltration channel.
```

### Acceptance

```text
A-PFC-010
```

### Evidence

```text
captured log assertions
```

---

# 11. Side-Effect Contract

| Operation | DB Write | File Write | Network | Cache | User Data | Business Source |
|---|---:|---:|---:|---:|---:|---:|
| path resolve | NO | NO | NO | NO | READ | NO |
| prefix read | NO | NO | NO | NO | READ <=16KiB | NO |
| content classify | NO | NO | NO | NO | NO | NO |
| reject mismatch | NO | NO | NO | NO | NO | NO |
| diagnostic log | NO | YES(log only) | NO | NO | metadata only | NO |
| existing import after PASS | existing | existing | existing | existing | existing | existing |

明确：

```text
read-only scope = source file + existing config + path policy。
cache 不作为 P0 Gate 的状态源。
日志属于 side effect，但仅允许元数据。
P0 Content Gate 本身不得触发 network。
```

---

# 12. Ownership Contract

## 12.1 Ownership Type

```text
Content Gate: GENERATED_ONLY runtime result
Source File: USER_OWNED
ManagedFile: existing File Platform ownership
Knowledge Draft: existing Knowledge ownership
```

## 12.2 Ownership Rule

```text
创建时 ownership：Gate 不创建文件。
更新后 ownership：不适用。
用户修改后 ownership：下一次 import 重新读取并重新判断。
升级时 ownership：无持久 Gate state 需要迁移。
remove 时 ownership：无 Gate state 删除。
```

## 12.3 Drift

Gate 不持久化 `last_applied`，不存在 persistent drift。

若文件在 Gate PASS 后、hash 前被外部进程修改：

```text
由现有 hash / downstream integrity 行为继续处理。
P0 不引入文件锁。
```

P0 MUST NOT 根据先前 Gate 结果跳过重新读取。

---

# 13. Hash / Identity Contract

现有 `contentHash` 语义保持不变：

```text
Algorithm: existing File Platform hashOrError implementation
Scope: entire file bytes as read by existing implementation
Encoding: existing implementation
Path: not included in content hash
Metadata: not included
Gate result: not included
```

P0 新增 Gate：

```text
MUST NOT 改变 contentHash 值。
MUST NOT 使用 prefix hash 替代 contentHash。
MUST 在 Gate PASS 后才调用 existing hashOrError。
```

Evidence 可额外计算测试 fixture 的 SHA-256，但不进入产品 schema。

---

# 14. Transaction Contract

## 14.1 Transaction Boundary

```text
TXN includes for Content Gate:
- canonical path already resolved
- prefix read
- classification
- decision
- FileImportResult error return

TXN excludes:
- existing ManagedFile transaction after PASS
- Knowledge remote upload
```

## 14.2 Commit Order

```text
resolve path
→ size/type policy
→ read prefix
→ classify
→ verify Gate
→ [PASS only] hash
→ [PASS only] managed copy if configured
→ [PASS only] ManagedFile / association
→ [PASS only] parse / Knowledge enqueue
```

## 14.3 Failure Atomicity

```text
T0 = Content Gate 执行前的 File Platform persistent state
```

要求：

```text
Gate READ_FAILED / INVALID_OR_ENCRYPTED:
AfterFailure(managed_scope) == T0
```

## 14.4 Rollback Failure

Content Gate 在 mutation 前运行，因此 Gate 自身：

```text
不需要 rollback。
```

Knowledge UI 已创建 draft 的场景属于 consumer-side pre-existing mutation：

```text
Failure → cancel newly created draft
Cancel failure → 保留 draft 的现有错误状态并由 Knowledge existing error handling 暴露；
MUST NOT 继续 enqueue/upload。
```

---

# 15. Conflict Contract

| Conflict | Detection | Default Behavior | Error | Mutation |
|---|---|---|---|---|
| extension=pdf, actual=unknown | Gate | BLOCK | `FILE_CONTENT_ENCRYPTED_OR_INVALID` | 0 |
| extension=docx, actual=zip | Gate | PASS | none | existing |
| extension=docx, actual=pdf | Gate | BLOCK | same | 0 |
| extension=txt, random bytes | applicability | PRESERVE existing behavior | none from P0 | existing |
| same file selected with valid sibling | per-item decision | invalid BLOCK, valid PASS | per-item | valid only |

禁止：

```text
last writer wins
best effort bypass of STRICT mismatch
自动把 extension 改成 detected type
```

---

# 16. Compatibility / Migration

## 16.1 Existing State

```text
旧版本：没有 import content Gate。
旧 schema：ManagedFile / FileImportResult unchanged except new error code enum。
旧目录：unchanged。
旧 API：HermesFilesAPI method signatures unchanged。
旧配置：desktop.files.* unchanged。
```

## 16.2 Migration

```text
detect: no persistent migration
adopt: existing importOnePath gets Gate
migrate: none
preserve: existing files / DB rows untouched
remove: none
```

## 16.3 Unknown Ownership

既有 ManagedFile：

```text
PRESERVE
MUST NOT retroactively scan
MUST NOT delete
```

## 16.4 Compatibility Rule

```text
STRICT type valid plaintext → existing behavior preserved。
STRICT type mismatch → newly blocked behavior。
NON-STRICT type → existing behavior preserved。
Clipboard staged file → P0 behavior unchanged。
```

---

# 17. External Dependency Contract

## 17.1 Node.js Filesystem

```text
name: Node.js fs/promises
version: project Electron/Node runtime
required API: open, FileHandle.read, close
fallback: none
failure behavior: FILE_READ_FAILED, zero mutation
```

## 17.2 Electron

```text
name: Electron Main Process
version: package baseline electron ^39.2.6
required role: file path access and Main-owned File Platform
failure behavior: existing picker/file errors
```

## 17.3 亿赛通

```text
name: 亿赛通 CDG / DLP client
P0 integration: NONE
SDK/API use: NONE
fallback: NONE
```

亿赛通 SDK-based detector belongs to a future P1/P2 design and MUST NOT be silently added under this P0 PRD。

## 17.4 New Third-Party Packages

```text
P0 MUST NOT add any new npm dependency for content detection.
```

---

# 18. Security Contract

| Threat | Control | Acceptance |
|---|---|---|
| path traversal / symlink | Continue existing canonical path policy before Gate | A-PFC-011 |
| arbitrary execution | Gate only reads bytes; no execution | A-PFC-011 |
| credential exposure | no credentials involved | A-PFC-010 |
| plaintext temp leakage | P0 creates no temp plaintext | A-PFC-002 |
| log leakage | no prefix/content/base64 in logs | A-PFC-010 |
| invalid content leaving client | STRICT mismatch blocked before consumer | A-PFC-002/A-PFC-008 |
| false vendor attribution | error says encrypted-or-invalid, not confirmed vendor encryption | A-PFC-012 |
| TOCTOU | Gate and hash remain separate reads; P0 does not claim file-lock atomicity | documented boundary |

Security rules：

```text
MUST NOT log document bytes。
MUST NOT write decrypted/plaintext copies。
MUST NOT upload mismatch content。
MUST preserve existing path validation before read。
```

---

# 19. Observability

## 19.1 Stage

P0 定义：

```text
RESOLVE
CONTENT_CHECK
IMPORT
```

新增 structured event 建议：

```json
{
  "operationId": "<uuid>",
  "stage": "CONTENT_CHECK",
  "status": "PASS | BLOCK | SKIP | ERROR",
  "fileName": "report.pdf",
  "extension": "pdf",
  "expectedKinds": ["pdf"],
  "actualKind": "unknown",
  "bytesInspected": 16384,
  "errorCode": "FILE_CONTENT_ENCRYPTED_OR_INVALID",
  "timestamp": "ISO-8601"
}
```

禁止字段：

```text
prefixHex
fileContent
base64
parsedText
full document bytes
```

路径：

```text
SHOULD NOT 在默认 INFO 日志中打印完整绝对路径。
需要现场 debug 时可通过现有 debug logging policy 输出 canonical path；不得输出内容。
```

---

# 20. Acceptance Design Standard

## A-PFC-001 — Valid Strong-Signature Files Pass

### Requirement Refs

```text
REQ-PFC-001
REQ-PFC-002
```

### Given

分别准备：

```text
valid.pdf
valid.docx
valid.xlsx
valid.pptx
valid.doc
valid.xls
valid.ppt
valid.png
valid.jpg
```

文件内容具有对应合法 P0 signature。

### When

调用 `validateFileContent()`，并通过 `importOnePath()` 导入。

### Then

```text
validation status = VALID_PLAINTEXT
FileImportResult.ok = true
existing import pipeline continues
```

### Oracle

```text
actualKind ∈ expectedKinds
import result ok == true
```

### Evidence

```text
test id: TEST-PFC-001
command: npm test -- protected-file-detector.test.ts file-import-service.test.ts
exit code: 0
artifact: vitest output
```

---

## A-PFC-002 — Invalid / Encrypted-looking PDF Is Blocked Before Mutation

### Requirement Refs

```text
REQ-PFC-001
REQ-PFC-002
REQ-PFC-004
```

### Given

```text
filename = encrypted.pdf
bytes do not contain %PDF- within first 1024 bytes
```

### When

调用 `importOnePath()`。

### Then

```text
FileImportResult.ok = false
error.code = FILE_CONTENT_ENCRYPTED_OR_INVALID
```

且：

```text
hashOrError call count = 0
storeManagedCopy call count = 0
upsertManagedFile call count = 0
insertAssociation call count = 0
Knowledge enqueue call count = 0
network upload call count = 0
```

### Oracle

精确 call count 与 error code。

### Evidence

```text
test id: TEST-PFC-002
exit code: 0
pre digest == post digest for persistent fixture store
```

---

## A-PFC-002b — PDF Leading-Junk Signature Still Passes

### Requirement Refs

```text
REQ-PFC-002
```

### Given

```text
filename = junk-prefix.pdf
bytes 0..N (N < 1024) are non-PDF junk
"%PDF-" appears within first 1024 bytes
```

### When

执行 Gate / `importOnePath()`。

### Then

```text
status = VALID_PLAINTEXT
actualKind = pdf
FileImportResult.ok = true
```

### Oracle

```text
actualKind == "pdf"
import ok == true
```

### Evidence

```text
test id: TEST-PFC-002b
```

---

## A-PFC-003 — OOXML ZIP Signature Pass

### Requirement Refs

```text
REQ-PFC-002
```

### Given

```text
valid.docx with ZIP signature
```

### When

执行 Gate。

### Then

```text
actualKind = zip
status = VALID_PLAINTEXT
```

### Oracle

```text
actualKind == "zip"
```

### Evidence

```text
test id: TEST-PFC-003
```

---

## A-PFC-004 — Renamed / Encrypted OOXML Is Blocked

### Requirement Refs

```text
REQ-PFC-002
REQ-PFC-004
```

### Given

```text
filename = secret.docx
prefix is unknown or pdf, not zip
```

### When

执行 import。

### Then

```text
error.code = FILE_CONTENT_ENCRYPTED_OR_INVALID
0 managed mutation
```

### Oracle

```text
status == INVALID_OR_ENCRYPTED
mutation spy count == 0
```

### Evidence

```text
test id: TEST-PFC-004
```

---

## A-PFC-005 — Legacy Office OLE Pass

### Requirement Refs

```text
REQ-PFC-002
```

### Given

`.doc/.xls/.ppt` prefix：

```text
D0 CF 11 E0 A1 B1 1A E1
```

### When

执行 Gate。

### Then

```text
actualKind = ole
status = VALID_PLAINTEXT
```

### Oracle

exact enum values。

### Evidence

```text
test id: TEST-PFC-005
```

---

## A-PFC-006 — Text and Non-Strict Types Preserve Compatibility

### Requirement Refs

```text
REQ-PFC-003
```

### Given

```text
.md UTF-8
.txt GBK-like bytes
.html
.svg
.unknown
```

### When

执行 Gate。

### Then

```text
status = NOT_APPLICABLE
P0 does not block import
```

### Oracle

```text
validation.status == NOT_APPLICABLE
```

### Evidence

```text
test id: TEST-PFC-006
```

---

## A-PFC-007 — Multi-Select Is Per-File Isolated

### Requirement Refs

```text
REQ-PFC-001
REQ-PFC-005
```

### Given

Chat picker 选择：

```text
valid.pdf
invalid.docx
valid.png
```

### When

`files.pickFiles({multiple:true})`。

### Then

```text
3 FileImportResult entries
valid.pdf ok=true
invalid.docx ok=false / FILE_CONTENT_ENCRYPTED_OR_INVALID
valid.png ok=true
```

Chat Attachment：

```text
2 valid attachments
1 error
```

### Oracle

```text
ok count == 2
error count == 1
```

### Evidence

```text
test id: TEST-PFC-007
```

---

## A-PFC-008 — Knowledge Invalid File Never Reaches Provider

### Requirement Refs

```text
REQ-PFC-004
REQ-PFC-006
```

### Given

```text
KnowledgeUploadPanel creates draft
picker selects invalid/encrypted-looking PDF
```

### When

File Platform 返回失败。

### Then

```text
imported.length == 0
draft Job becomes cancelled
bindJobManagedFile not called
enqueue not called
uploadBaseFile not called
```

### Oracle

```text
job.status == "cancelled"
provider upload call count == 0
```

### Evidence

```text
test id: TEST-PFC-008
```

---

## A-PFC-009 — Chat Invalid File Creates No Attachment

### Requirement Refs

```text
REQ-PFC-005
```

### Given

`FileImportResult.error.code = FILE_CONTENT_ENCRYPTED_OR_INVALID`。

### When

`resolveManagedResults()` 处理结果。

### Then

```text
attachments.length == 0 for rejected item
platformErrors contains actionable FileError.message / en i18n text
AttachmentError.code == read-failed
message MUST hint format mismatch or possible document protection + retry with readable copy
message MUST NOT contain "confirmed Eisoo" / "已确认亿赛通"
```

### Oracle

exact array values + string positive/negative assertions。

### Evidence

```text
test id: TEST-PFC-009
```

---

## A-PFC-010 — Logs Contain No Content Bytes

### Requirement Refs

```text
REQ-PFC-007
```

### Given

fixture 内容含唯一 marker：

```text
SMC_SECRET_CONTENT_MARKER_20260920
```

### When

执行 PASS 与 BLOCK 两种 Gate。

### Then

log 可包含 metadata，但 MUST NOT 包含：

```text
SMC_SECRET_CONTENT_MARKER_20260920
prefix hex
base64 of marker
```

### Oracle

```text
log.includes(marker) == false
```

### Evidence

```text
test id: TEST-PFC-010
```

---

## A-PFC-011 — Existing Path Security Remains Before Gate

### Requirement Refs

```text
REQ-PFC-001
Security Contract
```

### Given

无效、被拒绝或超出 path policy 的路径。

### When

调用 import。

### Then

```text
Content Gate not called
existing path error returned
```

### Oracle

```text
detector call count == 0
existing error code unchanged
```

### Evidence

```text
test id: TEST-PFC-011
```

---

## A-PFC-012 — No False Vendor Attribution

### Requirement Refs

```text
REQ-PFC-002
Security Contract
```

### Given

任一 STRICT mismatch 文件。

### When

返回错误。

### Then

```text
error.code = FILE_CONTENT_ENCRYPTED_OR_INVALID
message communicates format mismatch or possible document protection + retry with readable copy
message MUST NOT state "confirmed Eisoo encrypted" / "已确认亿赛通"
```

### Oracle

string negative assertion。

### Evidence

```text
test id: TEST-PFC-012
```

---

# 21. Acceptance Input Matrix

| Case | Declared | Prefix | Expected | Mutation |
|---|---|---|---|---:|
| 1 | pdf | `%PDF-` at offset 0 | PASS | existing |
| 1b | pdf | junk then `%PDF-` within 1024 | PASS | existing |
| 2 | pdf | random/encrypted (no `%PDF-` in 1024) | BLOCK | 0 |
| 3 | docx | ZIP | PASS | existing |
| 4 | docx | `%PDF-` | BLOCK | 0 |
| 5 | doc | OLE | PASS | existing |
| 6 | doc | random/encrypted | BLOCK | 0 |
| 7 | png | PNG | PASS | existing |
| 8 | jpg | JPEG | PASS | existing |
| 9 | md | arbitrary text | NOT_APPLICABLE | existing |
| 10 | txt | GBK-like | NOT_APPLICABLE | existing |
| 11 | unknown | arbitrary | NOT_APPLICABLE | existing |
| 12 | pdf | read permission denied | FILE_READ_FAILED | 0 |
| 13 | valid + invalid + valid | mixed | per-file isolation | valid only |
| 14 | Knowledge invalid PDF | random/encrypted | draft cancel | no upload |
| 15 | empty file named pdf | 0 bytes | BLOCK | 0 |

---

# 22. Negative Acceptance

必须覆盖：

```text
N-A-001
invalid.pdf
→ FILE_CONTENT_ENCRYPTED_OR_INVALID
→ 0 ManagedFile mutation

N-A-002
invalid.docx
→ FILE_CONTENT_ENCRYPTED_OR_INVALID
→ 0 Knowledge provider upload

N-A-003
path policy rejected file
→ existing path error
→ Gate not invoked

N-A-004
read failure
→ FILE_READ_FAILED
→ 0 mutation

N-A-005
content mismatch log
→ no raw bytes / hex / base64
```

---

# 23. Failure Injection

| Injection Point | Failure | Expected Postcondition |
|---|---|---|
| before prefix open | `open()` throws | `FILE_READ_FAILED`, T0 unchanged |
| during prefix read | `read()` throws | handle close attempted, T0 unchanged |
| after prefix read / before classify | injected detector error | `FILE_READ_FAILED` or normalized internal read failure; T0 unchanged |
| after classify mismatch | simulated invalid result | new error, T0 unchanged |
| Chat consumer after error result | renderer handling | no attachment |
| Knowledge consumer after error result | cancel succeeds | draft cancelled, no upload |
| Knowledge cancel fails | existing Knowledge error handling | MUST NOT enqueue/upload rejected file |
| logger write fails | logger exception swallowed/contained | Gate decision unchanged |

P0 没有 post-mutation rollback path，因为 Content Gate 必须位于第一 mutation 之前。

---

# 24. Evidence Contract

## 24.1 Evidence Record

每个 Required Acceptance 至少记录：

```json
{
  "acceptance_id": "A-PFC-002",
  "status": "PASS",
  "requirement_ids": ["REQ-PFC-001", "REQ-PFC-002", "REQ-PFC-004"],
  "test_ids": ["TEST-PFC-002"],
  "command": "npm test -- protected-file-detector.test.ts file-import-service.test.ts",
  "exit_code": 0,
  "oracle": {
    "error_code": "FILE_CONTENT_ENCRYPTED_OR_INVALID",
    "mutation_count": 0
  },
  "evidence_files": []
}
```

## 24.2 Evidence Integrity

Evidence MUST 关联：

```text
repo: loudon84/smc-copilot
branch: implementation branch
commit SHA: exact tested SHA
baseline SHA: e098f3f0c1bb09d80706fc4ded7122b68e55fb1d
test command
timestamp
Node/Electron/Vitest version
```

## 24.3 Runtime Manual Evidence

在亿赛通终端环境至少执行：

```text
1. 一个已确认普通明文 PDF
2. 一个现场会导致 Knowledge 解析失败的受保护 PDF
3. 一个普通 DOCX
4. 一个现场受保护 DOCX
```

记录：

```text
file name
extension
Gate status
actualKind
errorCode
是否创建 ManagedFile
是否触发 Knowledge upload
```

MUST NOT 记录文档正文。

---

# 25. Release Gate

状态：

```text
PASS
FAIL
SKIPPED
BLOCKED
```

## 25.1 CODE_RELEASE（工程发布门禁，REQUIRED）

```text
A-PFC-001 ~ A-PFC-012 全部 REQUIRED PASS
A-PFC-002b REQUIRED PASS
npm run typecheck PASS
npm run lint PASS
日志无正文 / prefix hex / base64（A-PFC-010）
```

规则：

```text
任一 CODE_RELEASE Required Acceptance != PASS
→ CODE_RELEASE = FAIL
→ implementation MUST NOT 被宣称 CODE_RELEASE_PASS
```

`FIELD_EVIDENCE` SKIPPED **不**使 CODE_RELEASE 失败。

## 25.2 FIELD_EVIDENCE / Spike（现场证据，不阻断 CODE_RELEASE）

```text
目标：验证或证伪「受保护文件在 Main 第一次 read 时已无合法签名」（grilling Q1 假设 A）。
最小 Spike：亿赛通终端上 1 明文 PDF + 1 受保护 PDF（SHOULD 另含 DOCX 对）。
只记录：file name、extension、Gate status、actualKind、errorCode、ManagedFile 是否创建、Knowledge upload 是否发生。
MUST NOT 记录文档正文 / 完整 prefix bytes。
```

规则：

```text
无法获得样本 → FIELD_EVIDENCE = SKIPPED（允许）
Spike 未完成 → 本能力 status MUST NOT = VERIFIED
Spike 完成且假设 A 成立（受保护样本被 Gate BLOCK 且 upload=0）→ FIELD_EVIDENCE = PASS
Spike 完成且出现 Escalate 条件（Appendix E）→ FIELD_EVIDENCE = PASS_WITH_ESCALATION；P0 仍可 CODE_RELEASE_PASS，MUST 开 P0.1
```

---

# 26. Golden Consumer / Real-world Acceptance

## 26.1 Synthetic Fixture

必须覆盖第 21 章矩阵（含 case 1b leading-junk PDF）。属于 CODE_RELEASE。

## 26.2 Real Consumer（FIELD_EVIDENCE）

```text
repo: loudon84/smc-copilot
baseline HEAD: e098f3f0c1bb09d80706fc4ded7122b68e55fb1d
consumer: packaged smc-copilot.exe on enterprise Windows endpoint
DLP: 亿赛通客户端已启用
```

Golden Consumer Evidence（若执行）MUST 记录：

```text
implementation commit SHA
working tree clean/dirty
smc-copilot version
Windows version
亿赛通 client enabled = yes
plain PDF Gate result
protected PDF Gate result
plain DOCX Gate result（SHOULD）
protected DOCX Gate result（SHOULD）
Knowledge provider request count for rejected files = 0（当 Gate BLOCK 时）
```

不得记录：

```text
文档正文
完整 prefix bytes
用户敏感路径内容
```

本节目证据属于 FIELD_EVIDENCE：SKIPPED 不阻断 CODE_RELEASE；完成前不得宣称 VERIFIED。

---

# 27. Requirement Traceability Matrix

| Requirement | Invariant | Acceptance | Test | Evidence | Release Gate |
|---|---|---|---|---|---|
| REQ-PFC-001 | INV-PFC-001/002 | A-PFC-001/002/007/011 | TEST-PFC-001/002/007/011 | EVID-PFC-* | CODE_RELEASE REQUIRED |
| REQ-PFC-002 | INV-PFC-003/004 | A-PFC-001~005/002b/012 | TEST-PFC-001~005/002b/012 | EVID-PFC-* | CODE_RELEASE REQUIRED |
| REQ-PFC-003 | INV-PFC-005 | A-PFC-006 | TEST-PFC-006 | EVID-PFC-006 | CODE_RELEASE REQUIRED |
| REQ-PFC-004 | INV-PFC-006 | A-PFC-002/004/008/009 | TEST-PFC-002/004/008/009 | EVID-PFC-* | CODE_RELEASE REQUIRED |
| REQ-PFC-005 | INV-PFC-007 | A-PFC-007/009 | TEST-PFC-007/009 | EVID-PFC-* | CODE_RELEASE REQUIRED |
| REQ-PFC-006 | INV-PFC-008 | A-PFC-008 | TEST-PFC-008 | EVID-PFC-008 | CODE_RELEASE REQUIRED |
| REQ-PFC-007 | INV-PFC-009 | A-PFC-010 | TEST-PFC-010 | EVID-PFC-010 | CODE_RELEASE REQUIRED |
| FIELD Spike | Appendix E | §25.2 / §26.2 | manual | EVID-FIELD-* | FIELD_EVIDENCE（可 SKIPPED） |

规则：

```text
任何 MUST 没有映射 → PRD BLOCKED
任何 AC 没有 Test → PRD BLOCKED
任何 Test 没有 Oracle → PRD BLOCKED
任何 CODE_RELEASE Required AC 没有 Evidence → CODE_RELEASE BLOCKED
FIELD_EVIDENCE SKIPPED ≠ CODE_RELEASE FAIL
```

---

# 28. Plan Generation Contract

当前 PRD 状态为：

```text
APPROVED_FOR_PLAN
```

允许生成 `.plan.md`。

Plan Agent MUST 编码 grilling 锁定项：

```text
- CODE_RELEASE / FIELD_EVIDENCE 分离
- PDF `%PDF-` within first 1024 + leading-junk AC
- Chat/Knowledge 可操作 en i18n 文案；AttachmentError 仍为 read-failed
- Clipboard 仍 OOS
- Residual Risk + P0.1 Escalate 条件
- 不得将 ZIP pass 解释为 OOXML parser pass
- 不得引入亿赛通 SDK
```

## 28.1 Semantic Gap Check

本 PRD 已明确：

```text
Gate 位置
强校验扩展名集合
Signature semantics
非强校验兼容策略
错误码
副作用边界
Knowledge 行为
Chat 行为
日志内容边界
Acceptance Oracle
```

Plan Agent MUST NOT 擅自：

```text
引入亿赛通 SDK
增加明文临时文件
把文本类改为 hard block
把 ZIP pass 解释为 OOXML parser pass
改变 contentHash
```

## 28.2 Requirement Coverage Check

每个 Requirement：

```text
有 ID
有 AC
有 Failure
有 Oracle
有 Evidence
```

## 28.3 Side Effect Check

所有 Gate mutation：

```text
仅 local safe metadata log
```

所有业务 mutation：

```text
必须在 Gate PASS / NOT_APPLICABLE 后发生
```

## 28.4 State Authority Check

Gate state：

```text
runtime-only
no persistent SOT
```

## 28.5 Failure-path Check

```text
read failure → zero mutation
signature mismatch → zero mutation
Knowledge invalid import → cancel draft, no upload
logger failure → does not change Gate decision
```

---

# 29. `.plan.md` 输出标准

后续计划 Todo MUST 使用：

```yaml
id:
requirement_refs:
acceptance_refs:
files_or_symbols:
implementation_goal:
preconditions:
state_transition:
side_effect_scope:
failure_cases:
verification:
status:
evidence:
```

## 29.1 Required File Change Set

Plan MUST cover exactly the following required changes unless review produces a new PRD version：

### NEW — `apps/work/src/main/files/protected-file-detector.ts`

职责：

```text
read prefix
normalize extension applicability
detect exact content kind
compare expectedKinds
return FileContentValidationResult
```

### MODIFY — `apps/work/src/main/files/file-import-service.ts`

位置：

```text
assertImportAllowed 成功后
hashOrError 之前
```

新增：

```text
validateFileContent(canonical, name)
block mismatch/read failure
```

### MODIFY — `apps/work/src/main/files/file-security.ts`

要求：

```text
保留现有 API 兼容性。
扩展或拆分 binary signature helper，使 P0 支持 ole 与 bmp，并能区分 png/jpeg/gif/webp/bmp。
MUST NOT 用现有宽松 text heuristic 作为 STRICT hard-block 的依据。
```

### MODIFY — `apps/work/src/shared/files/file-errors.ts`

新增：

```text
FILE_CONTENT_ENCRYPTED_OR_INVALID
```

### MODIFY — `apps/work/src/renderer/src/screens/Chat/composerFilePlatform.ts`

新增：

```text
FILE_CONTENT_ENCRYPTED_OR_INVALID → read-failed
```

### NO PRODUCT CHANGE REQUIRED — `KnowledgeUploadPanel.tsx`

当前已有：

```text
imported.length === 0 → cancel(draft.jobId)
```

P0 默认不修改该产品逻辑，只补回归测试。

### NEW TEST — `apps/work/src/main/files/protected-file-detector.test.ts`

覆盖 signature matrix（含 PDF leading-junk within 1024、OLE、BMP 细分 image kinds）。

### NEW TEST — `apps/work/src/main/files/file-import-service.test.ts`

覆盖 Gate 顺序与 zero-mutation semantics。

### NEW TEST — `apps/work/src/renderer/src/screens/Chat/composerFilePlatform.test.ts`

覆盖 Chat mapping 与 multi-select isolation。

### NEW TEST — `apps/work/src/renderer/src/screens/Knowledge/features/file-job/KnowledgeUploadPanel.test.tsx`

覆盖 A-PFC-008：invalid import → cancel draft → no provider upload。

## 29.2 Verification Commands

在 `apps/work` 目录：

```bash
npm test -- protected-file-detector.test.ts file-import-service.test.ts composerFilePlatform.test.ts KnowledgeUploadPanel.test.tsx
npm run typecheck
npm run lint
```

如 Vitest file pattern 需要完整路径，Plan MUST 使用仓库实际路径执行，不得跳过对应测试。

---

# 30. Code Review Contract

Review 顺序：

```text
1. Gate 是否真正位于 hash / mutation 前
2. STRICT matrix 是否按 PRD 精确实现
3. 文本 / unknown 是否保持 NOT_APPLICABLE
4. mismatch 是否零 mutation
5. 新错误码是否完整穿透 FileImportResult
6. Chat 是否不创建 invalid attachment
7. Knowledge 是否无 upload
8. 日志是否不含内容
9. contentHash 是否未改变
10. Tests / Evidence 是否覆盖现场问题
11. Code quality
```

Review MUST 明确检查以下危险实现：

```text
禁止：先 hash 再 Gate
禁止：先 storeManagedCopy 再 Gate
禁止：在 Renderer 读取绝对路径做检测
禁止：将 invalid file 自动改扩展名后放行
禁止：把 random bytes 当 text 后放行 STRICT binary extension
禁止：记录前 16KB hex
禁止：加入亿赛通 native SDK
```

---

# 31. PRD Quality Gate

## Architecture

```text
[x] Goal 唯一明确
[x] Scope / Non-goal 完整
[x] Owner 不重叠
[x] System Boundary 明确
```

## State

```text
[x] Gate state 定义为 runtime-only
[x] Observed / Resolved / Evidence 分离
[x] State transition 明确
```

## Semantics

```text
[x] default 行为明确
[x] STRICT / NOT_APPLICABLE 语义明确
[x] conflict 行为明确
[x] ownership 明确
[x] hash scope 明确且不变
```

## Side Effects

```text
[x] Content Gate 为 read-only + safe local log
[x] FAIL 明确 0 managed mutation
```

## Failure

```text
[x] read failure error code 明确
[x] mismatch error code 明确
[x] Gate 不需要 rollback
[x] Knowledge draft failure path明确
```

## Acceptance

```text
[x] 每个 MUST 有 AC
[x] BLOCK / MUST NOT 有 Negative AC
[x] failure injection 明确
[x] 高风险输入矩阵明确
[x] Oracle 可机器判断
```

---

# Appendix A — P0 Recommended Implementation Skeleton

> 本附录用于消除 Plan 语义歧义，不替代代码实现。

```ts
// protected-file-detector.ts

export const MAX_PREFIX_BYTES = 16 * 1024;

export async function validateFileContent(
  filePath: string,
  fileName: string,
): Promise<FileContentValidationResult> {
  const extension = extensionFromName(fileName);
  const expectedKinds = expectedContentKinds(extension);

  if (expectedKinds.length === 0) {
    return {
      status: "NOT_APPLICABLE",
      extension,
      expectedKinds: [],
      actualKind: "unknown",
      bytesInspected: 0,
      reason: "type-not-applicable",
    };
  }

  const prefix = await readFilePrefix(filePath, MAX_PREFIX_BYTES);
  const actualKind = detectStrictContentKind(prefix);

  if (expectedKinds.includes(actualKind)) {
    return {
      status: "VALID_PLAINTEXT",
      extension,
      expectedKinds,
      actualKind,
      bytesInspected: prefix.length,
      reason: "signature-match",
    };
  }

  return {
    status: "INVALID_OR_ENCRYPTED",
    extension,
    expectedKinds,
    actualKind,
    bytesInspected: prefix.length,
    reason: "signature-mismatch",
  };
}
```

`importOnePath()` integration order：

```ts
const sizeResult = readFileSize(canonical);
...
const denied = assertImportAllowed(name, size, config);
if (denied) return { ok: false, error: denied };

// P0 NEW — first content gate, before hash/mutation.
let validation: FileContentValidationResult;
try {
  validation = await validateFileContent(canonical, name);
} catch {
  return {
    ok: false,
    error: makeFileError(
      "FILE_READ_FAILED",
      "Failed to read file content for validation",
    ),
  };
}

if (validation.status === "INVALID_OR_ENCRYPTED") {
  return {
    ok: false,
    error: makeFileError(
      "FILE_CONTENT_ENCRYPTED_OR_INVALID",
      "File content does not match its declared format, or may be protected; try a readable plaintext copy",
      { detail: `${validation.extension}:${validation.actualKind}` },
    ),
  };
}

// Existing code only starts here.
const hashResult = await hashOrError(canonical);
```

---

# Appendix B — Why P0 Is Not “Encryption Detection”

P0 的名称是“明文可读性校验”，不是“亿赛通密文识别”。

这是有意的架构边界：

```text
文件扩展名 = PDF
Main read prefix = %PDF-
→ 可以证明当前进程看到了 PDF 明文特征

文件扩展名 = PDF
Main read prefix = unknown/random
→ 可以证明当前进程没有看到 PDF 明文特征
→ 不能仅据此证明一定是亿赛通密文
```

因此 P0 error 使用：

```text
FILE_CONTENT_ENCRYPTED_OR_INVALID
```

而不是：

```text
EISOO_ENCRYPTED_FILE
```

未来只有在接入厂商官方 Windows API 后，才允许增加：

```text
provider = eisoo
protected = true
readableAsPlaintext = true/false
```

该未来能力不属于本 PRD。

---

# Appendix C — Expected P0 Runtime Flow

```text
files.pickFiles()
      │
      ▼
dialog.showOpenDialog()
      │
      ▼
importOnePath(path)
      │
      ├─ resolveAndValidate
      │
      ├─ readFileSize
      │
      ├─ assertImportAllowed
      │
      ▼
┌───────────────────────────────┐
│ File Content Readability Gate │
│ read <= 16 KiB                │
│ extension ↔ signature         │
└───────────────────────────────┘
      │
      ├── INVALID / READ FAIL
      │       │
      │       ▼
      │   FileImportResult.error
      │       │
      │       ├─ Chat: no attachment
      │       └─ Knowledge: cancel draft, no upload
      │
      └── VALID / NOT_APPLICABLE
              │
              ▼
          hashOrError
              │
              ▼
       optional managed copy
              │
              ▼
          ManagedFile
              │
       ┌──────┴──────┐
       ▼             ▼
     Chat        Knowledge
                    │
                    ▼
             readFile(bytes)
                    │
                    ▼
              HTTP upload
```

---

# Final Release Decision Rule

## CODE_RELEASE_PASS（可宣称工程完成 / 可合入实现）

```text
1. A-PFC-001 ~ A-PFC-012 与 A-PFC-002b 全部 PASS；
2. npm run typecheck PASS；
3. npm run lint PASS；
4. 日志中无正文、prefix hex、base64；
5. implementation commit 与 Evidence 中 SHA 一致。
```

FIELD_EVIDENCE SKIPPED 不阻止 CODE_RELEASE_PASS。

## VERIFIED（产品/现场有效性）

```text
MUST 完成 §25.2 Spike（至少 PDF 明文 + 受保护各 1）。
若假设 A 成立：受保护样本 Gate BLOCK 且 Knowledge upload count = 0。
若触发 Appendix E Escalate：记录 PASS_WITH_ESCALATION 并开 P0.1；P0 仍可保持 CODE_RELEASE_PASS，但宣称「已解决亿赛通上传失败」MUST NOT。
Spike 未完成 → MUST NOT status=VERIFIED。
```

否则：

```text
CODE_RELEASE != PASS 或 VERIFIED 条件未满足（按上表）
```

---

# Appendix D — Residual Risk（grilling locked）

P0 已知且接受的残留风险：

```text
R-001 假 ZIP / 非 OOXML ZIP
.docx 等仅验 ZIP 签名即 PASS；损坏或伪装 ZIP 仍可能进入后续 Parser 失败。

R-002 现场根因未验证
grilling Q1=D：尚未用受保护样本证明 Main 第一次 read 已无合法签名。
CODE_RELEASE 不依赖该证明；VERIFIED 依赖 Spike。

R-003 二次 read / DLP 滤镜差异（OOS）
Gate PASS 后 Knowledge 再 readFile 可能得到不同字节。见 NON-GOAL-010 / Appendix E。

R-004 文本 / 代码 / SVG / unknown
NOT_APPLICABLE：密文或乱码若使用这些扩展名，P0 不阻断。

R-005 Clipboard
NON-GOAL-007：stageClipboardImport 不经本 Gate。

R-006 错误归因
FILE_CONTENT_ENCRYPTED_OR_INVALID ≠ 已确认亿赛通密文。
```

---

# Appendix E — P0.1 Escalate Triggers

以下任一在 Spike 或后续现场出现，MUST 开 P0.1（不自动并入本 P0 实现范围）：

```text
E-001
现场受保护 PDF/DOCX：Gate = VALID_PLAINTEXT，但 Knowledge 仍解析失败或上传后不可用。

E-002
Gate PASS 后、upload 前二次 sniff 的 actualKind 与 Gate 不一致。
```

P0.1 候选方向（非本 PRD MUST）：

```text
- upload 前二次 sniff 并 BLOCK on drift
- Gate/hash/upload 共用同一次打开的字节
- 厂商 Windows API 密文判定（独立 PRD）
```

P0 CODE_RELEASE_PASS 在 Escalate 后仍然有效；不得删除已落地的工程门禁，除非后续 REPLACE PRD 明确要求。

---

# Appendix F — Grilling Shared Understanding Lock

```text
Q1=D  根因未用样本验证
Q2=C  ship=工程门禁；现场非 CODE_RELEASE 硬门槛
Q3=A  OOXML 只验 ZIP（残留见 R-001）
Q4=A  合并错误码，不声称 confirmed Eisoo
Q5=A  二次 read OOS
Q6=C  可 APPROVED_FOR_PLAN；VERIFIED 等 Spike
Q7=A  CODE_RELEASE / FIELD_EVIDENCE 分离
Q8=B  中性码 + 可操作 UI 文案
Q9=A+C PDF 前 1024 搜索 + leading-junk AC
Q10=A 预写 Escalate
Q11=A 文本 NOT_APPLICABLE
Q12=A Clipboard OOS
Q13=A+C read-failed + en i18n
Q14=C Escalate = E-001 OR E-002
Q15=B 本版写入并 APPROVED_FOR_PLAN
Q16=A Residual Risk = Appendix D
```

Grilling session frontier: EMPTY.
