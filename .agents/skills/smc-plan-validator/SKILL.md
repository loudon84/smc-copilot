---
name: smc-plan-validator
description: GES 5 static Plan validator. v3.7 adds LEAN/FULL governance-profile checks while preserving Single Writer, acceptance, domain and test-asset gates.
version: 2.0.0
---

# SMC Plan Validator v2.0

Use the stable dispatcher:

```bash
python .agents/skills/smc-plan-validator/scripts/validate_plan_current.py <PLAN>
```

Supported historical readers remain v3.3-v3.6; new authoring targets `smc.plan.v3.7`.

v3.7 validates every invariant shared by v3.6 plus:

- `governance_profile` is LEAN or FULL;
- LEAN does not contain deterministic hard-FULL signals;
- Domain contract is v2 and policy digest/activation ledger are fresh;
- project policy binding, when declared, is present/fresh;
- LEAN N/A sections are only allowed for untriggered full-only closure;
- ownership, acceptance, verification, domain activation, test assets and commit policy can never be omitted.

Static PASS is not implementation complete and never substitutes semantic review or Delivery.
