# Frontend Testing Policy

Choose the lowest level that proves the claim:

1. static: lint/typecheck/contract guards;
2. component: unit + DOM behavior;
3. interaction: browser/renderer automation;
4. live visual: real application surface, screenshot/DOM/console oracle.

Do not replace behavioral verification with snapshots alone. Do not make screenshot difference a blocking oracle unless the Plan defines the expected visual fact and environment sufficiently for deterministic evaluation.
