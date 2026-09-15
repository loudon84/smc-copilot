---
name: executing-plans
description: GES 5 sequential implementation engine. Executes canonical Todos with method gates, source-context reuse and focused checks; never owns final delivery truth.
version: 5.0.0
---

# Executing Plans v5.0

Preconditions: one canonical Plan, Static PASS, Semantic clearance, `post_review`, workspace frozen.

For each pending Todo in dependency order:

1. controller marks in-progress;
2. assert workspace stable;
3. capture/reuse content-bound Source Context Capsules instead of rereading unchanged owner files;
4. run Engineering Method classifier;
5. obey profile: MECHANICAL / BEHAVIOR_CHANGE / BUG_FIX / HIGH_RISK;
6. implement only owned `Writes`;
7. run TDD/debug method gates when required;
8. run focused check;
9. produce task report/review package when configured;
10. controller alone marks completed after all local/method gates pass.

A root cause outside write ownership stops implementation. New owner/contract/boundary/observable
behavior returns upstream instead of opportunistic scope expansion.

No implementation engine commits. After all Todos complete return only
`IMPLEMENTATION_ENGINE_COMPLETE` to `smc-plan-delivery`.
