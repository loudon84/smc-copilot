# Clarification Contract v1

Clarification reduces downstream rework; it is not a product interview loop.

## Candidate categories

- functional scope / out-of-scope;
- domain/data lifecycle;
- critical UX flow and loading/empty/error states;
- security/privacy/authorization;
- integration failure behavior;
- performance/reliability/operational constraints;
- acceptance/verification ambiguity;
- frontend layout/component/state ownership when frontend is activated.

## Budget

Maximum five accepted questions per clarification session. Ask one question at a time. Questions
must have material implementation or verification impact. If no material ambiguity exists, ask
zero questions.

Context packet for optional Spec Kit provider (when present) is limited to: bounded user
objective, bound Work Facts summary, current Stage PRD relevant sections, minimal source
anchors, and the open clarification ledger. Do not send the full repository, full chat history,
or full Plan/Delivery evidence. Identical source digests may reuse a prior context packet.

Provider unavailable → `provider_status=UNAVAILABLE`, `integration_status=NATIVE_ONLY`; continue
with native clarify and never claim Spec Kit was used. Stale/malformed/conflicting proposals
return `SPEC_KIT_RESULT_INVALID|STALE|CONFLICT` and are not auto-applied.

## Ledger

```markdown
## Clarification Ledger
| ID | Category | Impact | Question | Answer | Affects | Status |
|---|---|---|---|---|---|---|
| Q01 | UX | HIGH | ... | ... | AC-02 | CLOSED |
```

All HIGH clarification rows must be CLOSED before initial PRD Review. A clarification that exposes
a hard FULL trigger upgrades `governance_profile` before review.
