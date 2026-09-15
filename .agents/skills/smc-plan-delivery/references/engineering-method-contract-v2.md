# Engineering Method Runtime v2

Each Todo has a deterministic method projection:

```text
MECHANICAL      -> FAST / TDD preferred-or-N/A / debug on failure / unified review
BEHAVIOR_CHANGE -> STANDARD / TDD required / debug on failure / unified review
BUG_FIX         -> STANDARD / systematic debug + regression TDD / unified review
HIGH_RISK       -> REASONING / TDD required / independent review
```

Classifier signal precedence:

1. structured Plan metadata / verification / domain / lifecycle signals;
2. Todo ownership and write shape;
3. bounded keyword fallback;
4. fail-safe default.

Every method record has a persisted unique `method_epoch`; unchanged classification reuses it, while policy changes never resurrect an old epoch. TDD/debug events are valid only for the
current Plan semantic hash and method epoch. Latest successful code-bound event must match the
current owned-source fingerprint.

Model tier is an abstract capability request. Provider/model IDs belong to Harness/Consumer policy.

For v3.7, use `tdd-run --phase RED|GREEN|REFACTOR --command <same-test-command>`; declaration-only `tdd-event` rows cannot satisfy gates. Receipts bind actual exit code/output digest and current owned files, including test changes. A failing RED still needs human confirmation that the oracle failed for the intended reason. Local receipts are not signed external attestation.

Debug ROOT_CAUSE must reference an earlier `debug-run REPRODUCTION` receipt (`command:<output-sha256>`) with a meaningful root summary. FIX_ATTEMPT cannot precede that root. Final completion requires a fresh successful `debug-run VERIFIED --expect PASS`. Three failed fixes escalate. A source mutation after GREEN or VERIFIED invalidates freshness.

`plan_state set ... completed` and final delivery validation both enforce method checks for v3.7. Older contracts retain v1 semantics. Explicit `engineering_method.py migrate <plan> --todo T1 --reason <approved-reason>` archives prior metadata, starts a new epoch and requires new evidence. It never promotes v1 events.
