# RM-02 Managed Hermes Verification Closure — PRD Initial Review

Reviewer: independent subagent (smc-prd-review seven gates)
PRD: `docs/work/PRD-WORK-v4.1.0-managed-hermes-verification-closure.md` v0.1.0-draft
Date: 2026-09-10

## Verdict

RETURN_PRD

## Gate Results

| Gate | Result |
|---|---|
| G1 Scope | PASS |
| G2 Existing Capability | PASS |
| G3 Production Ownership | PASS |
| G4 Classification | PASS |
| G5 Boundary | FAIL |
| G6 Behaviour→AC | FAIL |
| G7 Acceptance Claims & Evidence Integrity | FAIL |

## Findings

| ID | Severity | Note |
|---|---|---|
| F1 | BLOCKER | Typecheck 排除不合法。Parent AC-20 / DOD-01 要求 typecheck PASS 且禁止延后 blocking FAIL；RM-02 Roadmap 行不能单方面改写已批准 parent 合同。须先修复 typecheck，或正式修订并重新批准 parent PRD，同时同步 RM-01 Exit Criteria。 |
| F2 | BLOCKER | 听口匹配并非 fail-closed。“任意 python.exe 且 CommandLine 含期望 hermes.exe”会把仅携带该字符串的 foreign Python 进程判为合法。必须约束 managed Python 路径、精确 argv token、`gateway run` 子命令；CommandLine 缺失、解析失败或混合监听者必须保持非 READY。 |
| F3 | MAJOR | V12 被整体遗漏。Parent V12 还包含 package tests、`lat check`、文档语义与 commit/status 边界；即使获批排除 typecheck，也必须拆分 V12 并保留其余 blocking 证据。 |
| F4 | NOTE | 未发现重写旧 run 或重做 RM-01 实现。 |
| F5 | NOTE | Roadmap 证据拆分（RM-01 `external-artifact:` / RM-02 `smc-evidence:`）符合 `validate_roadmap_v11.py`。 |

## Required Changes

1. Resolve F1 via parent PRD revision (AC-20) **or** include package-wide typecheck PASS in RM-02.
2. Tighten C03/AC-05 listen-match oracle per F2.
3. Split parent V12; keep non-typecheck parts blocking.
