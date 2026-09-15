# SMC TDD Method v1

## Goal

Use RED-GREEN-REFACTOR as an implementation discipline without turning TDD into a Core Frozen Invariant for every file type.

## Policies

```text
TDD_REQUIRED
TDD_PREFERRED
TDD_NOT_APPLICABLE
```

`TDD_REQUIRED` is the default for bug fixes and clearly identified observable behavior changes. Ambiguous implementation work may start as `TDD_PREFERRED` and can be upgraded by the controller. `TDD_NOT_APPLICABLE` is reserved for changes such as documentation, generated output, or pure metadata/configuration where a meaningful behavior-first automated test does not exist.

## Required Cycle

For `TDD_REQUIRED`:

```text
RED
  write the smallest behavior/regression test
  run it
  confirm it fails for the intended missing/broken behavior

GREEN
  make the smallest production change
  run the focused test
  confirm PASS

REFACTOR
  optional cleanup only while remaining green
```

A test that passes before the production change does not prove RED. A syntax/setup error also does not prove RED.

## Runtime Recording

Example:

```bash
python .agents/skills/smc-plan-delivery/scripts/engineering_method.py \
  tdd-event "$PLAN_PATH" --todo T1 --phase RED --status CONFIRMED \
  --command "pytest tests/test_x.py" --note "fails because behavior is missing"

python .agents/skills/smc-plan-delivery/scripts/engineering_method.py \
  tdd-event "$PLAN_PATH" --todo T1 --phase GREEN --status PASS \
  --command "pytest tests/test_x.py" --note "regression passes"

python .agents/skills/smc-plan-delivery/scripts/engineering_method.py \
  tdd-check "$PLAN_PATH" --todo T1
```

## Proof Boundary

TDD records stay under `.smc/runs/<plan-id>/engineering/`. They are not durable verification manifests. The final Verification phase must still independently establish current blocking proof using the existing SMC evidence layer.
