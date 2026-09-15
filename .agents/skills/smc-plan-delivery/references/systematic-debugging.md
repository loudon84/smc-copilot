# SMC Systematic Debugging Method v1

## Rule

For bug-shaped work, do not change production code before establishing a reproducible root-cause hypothesis supported by evidence.

## Phases

```text
1. ROOT_CAUSE
   read the actual error/trace
   reproduce consistently where possible
   inspect recent changes and component boundaries
   trace bad state/data toward its source

2. PATTERN
   compare with a working path/reference
   enumerate material differences

3. HYPOTHESIS
   state one causal hypothesis
   test the smallest discriminating variable

4. FIX_ATTEMPT
   create/confirm the regression RED case
   apply one root-cause fix
   run focused checks

5. VERIFIED
   local fix behavior is confirmed
   final delivery Verification still happens later
```

## Runtime Gate

For `BUG_FIX`, `debug-check` must report `DEBUG_ROOT_CAUSE_CONFIRMED` before production fix work proceeds.

```bash
python .agents/skills/smc-plan-delivery/scripts/engineering_method.py \
  debug-event "$PLAN_PATH" --todo T1 --phase ROOT_CAUSE --status CONFIRMED \
  --summary "bad value originates in ..."

python .agents/skills/smc-plan-delivery/scripts/engineering_method.py \
  debug-check "$PLAN_PATH" --todo T1
```

## Three-Failure Breaker

Three failed `FIX_ATTEMPT` records cause:

```text
DEBUG_ARCHITECTURE_ESCALATION
```

Do not dispatch a fourth blind fix. Re-evaluate Plan/architecture assumptions and escalate model/reviewer capability only after deciding whether the current Plan is still valid.

## Scope Governance

Root cause discovery does not grant write permission. If the root cause lives outside the current Todo write owner, return to Plan revision or PRD/architecture governance according to the kind of drift.
