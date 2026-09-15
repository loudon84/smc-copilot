---
name: smc-prd-grounding
description: GES 5 Stage PRD grounding with LEAN/FULL profiles, bounded clarification, source freshness and anti-duplicate production ownership.
version: 5.0.0
disable-model-invocation: true
---

# SMC PRD Grounding v5.0

## Purpose

Turn one READY Roadmap Item into a source-grounded Stage PRD without duplicating capability or
repeating unchanged discovery. GES 5 adds `governance_profile: LEAN|FULL` and bounded
clarification. Spec Kit may act as an optional UX provider (`ADAPTER_READY` / `NATIVE_ONLY` when
unavailable); the Stage PRD remains the only requirement SOT and `smc-prd-grounding` is the
canonical writer that may apply validated `smc.ges.ux-proposal.v1` proposals.

## Modes

```text
discover   first grounding / missing evidence
clarify    close high-impact ambiguity before review
verify     reuse fresh anchors and verify affected scope only
revision   close OPEN review findings + direct regression
```

## Profile selection

Run the Work Router first. New governed BOUNDED work normally enters LEAN. Any hard trigger
returns `FULL_REQUIRED`. The profile is monotonic for a work item.

### LEAN minimum contract

- Objective / Out of Scope;
- current capability and unique Production Owner;
- stable Change IDs with KEEP/MODIFY/ADD/REPLACE/REMOVE;
- observable behaviour + Acceptance Criteria;
- minimal Source Anchors and `grounded_commit`;
- risk/escalation flags;
- a `Routing Facts` JSON object using the Work Router boolean keys (unknown risks require FULL); canonical headings `Objective`, `Out of Scope`, `Production Owner`, `Change Classification`, `Acceptance Criteria`, `Source Anchors`;
- Clarification Ledger if questions were needed.

### FULL contract

Retains the full existing capability inventory, boundary/contract closure, evidence baseline,
Acceptance Claim Baseline, lifecycle semantics and compatibility decisions.

LEAN is forbidden from inventing a new owner, contract or lifecycle. Discovery of such need
returns `FULL_REQUIRED`.

## Evidence freshness / no duplicate discovery

Use `source_revision` + `grounded_commit` and project freshness tooling:

```text
REUSE          -> reuse inventory/anchors
VERIFY_ONLY    -> inspect affected anchors only
REGROUND_REQUIRED -> re-ground affected capability only
UNKNOWN        -> establish source baseline first
```

Independent review means independent judgment, not a second repository scan.

## Clarify mode

Read `references/clarification-contract.md`. First run:

```bash
python .agents/skills/smc-prd-grounding/scripts/prd_profile.py scan <PRD> --json
```

Only ask questions that materially alter scope, architecture, UX, security, verification or
operational readiness. Prioritize `Impact × Uncertainty`, ask one at a time, maximum five accepted
questions per session, and write each answer into both `Clarification Ledger` and the affected PRD
section. Do not create `.specify/spec.md` or another requirements document.

## Capability anti-duplication

```text
EXISTS   -> KEEP
PARTIAL  -> MODIFY existing owner
MISSING  -> ADD only after proving no equivalent/extensible owner
CONFLICT -> REPLACE + REMOVE
UNKNOWN  -> do not guess
```

New Service/Store/Client/Protocol requires FULL and explicit justification.

## Domain preplan handoff

After Change Classification is grounded and **before initial PRD Review**, query activated Domain Pack v2 `preplan` providers. They add/validate Domain Design Intent in this same Stage PRD so the design decision is reviewed and frozen before approval. They never own a second artifact.

## Exit

Grounding/clarification complete -> `status: REVIEW_REQUIRED` -> `smc-prd-review`.
DRAFT/REVIEW_REQUIRED are not committed as final artifacts.
