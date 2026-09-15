# Consumer Audit Report

- Project: `E:\git\smc-copilot`
- Audited at: `2026-09-15T10:48:05Z`
- Overall: `PASS`

## Layers

- **ges**: `PASS` (26/26)
- **spec_kit**: `PASS` (4/4)
- **superpowers**: `PASS` (8/8)
- **frontend_context**: `PASS` (1/1)

## Claims

- `frontend_context`: `GES_NATIVE`
- `ges`: `GES_NATIVE`
- `spec_kit_provider`: `NATIVE_ONLY`
- `spec_kit_scaffold`: `ADAPTER_READY`
- `superpowers_pinned`: `UPSTREAM_PINNED`
- `superpowers_shims`: `GES_NATIVE`

## Checks

- [PASS] `ges.install_lock` → `.smc/ges-install-lock.json`
  - schema=smc.ges.install-lock.v2
- [PASS] `ges.install_receipt_pointer` → `.smc/ges-install-receipt.json`
- [PASS] `ges.profile` → `.agents/ges/profile.json`
- [PASS] `ges.domain_registry` → `.agents/ges/domain-packs/registry.json`
- [PASS] `ges.domain_runtime` → `.agents/ges/domain-runtime/domain_runtime.py`
- [PASS] `ges.plan_validator` → `.agents/skills/smc-plan-validator/scripts/validate_plan_v37.py`
- [PASS] `ges.delivery_runtime` → `.agents/skills/smc-plan-delivery/scripts/run_selftest.py`
- [PASS] `ges.acceptance_surface` → `.agents/skills/smc-plan-delivery/scripts/acceptance.py`
- [PASS] `ges.telemetry` → `.agents/skills/smc-plan-delivery/scripts/runtime_metrics.py`
- [PASS] `ges.work_router` → `.agents/skills/smc-work-router/SKILL.md`
- [PASS] `ges.managed.smc-architecture-decision` → `.agents/skills/smc-architecture-decision/SKILL.md`
- [PASS] `ges.managed.smc-architecture-review` → `.agents/skills/smc-architecture-review/SKILL.md`
- [PASS] `ges.managed.smc-roadmap` → `.agents/skills/smc-roadmap/SKILL.md`
- [PASS] `ges.managed.smc-prd-grounding` → `.agents/skills/smc-prd-grounding/SKILL.md`
- [PASS] `ges.managed.smc-prd-review` → `.agents/skills/smc-prd-review/SKILL.md`
- [PASS] `ges.managed.smc-prd-converge` → `.agents/skills/smc-prd-converge/SKILL.md`
- [PASS] `ges.managed.smc-plan-from-approved-prd-ponytail` → `.agents/skills/smc-plan-from-approved-prd-ponytail/SKILL.md`
- [PASS] `ges.managed.smc-plan-validator` → `.agents/skills/smc-plan-validator/SKILL.md`
- [PASS] `ges.managed.smc-plan-review` → `.agents/skills/smc-plan-review/SKILL.md`
- [PASS] `ges.managed.smc-plan-delivery` → `.agents/skills/smc-plan-delivery/SKILL.md`
- [PASS] `ges.managed.executing-plans` → `.agents/skills/executing-plans/SKILL.md`
- [PASS] `ges.managed.subagent-driven-development` → `.agents/skills/subagent-driven-development/SKILL.md`
- [PASS] `ges.managed.smc-work-router` → `.agents/skills/smc-work-router/SKILL.md`
- [PASS] `ges.managed.using-superpowers` → `.agents/skills/using-superpowers/SKILL.md`
- [PASS] `ges.consumer_required.code-review-and-quality` → `.agents/skills/code-review-and-quality/SKILL.md`
- [PASS] `ges.consumer_required.verification-before-completion` → `.agents/skills/verification-before-completion/SKILL.md`
- [PASS] `spec_kit.specify.constitution.md` → `.specify/constitution.md`
- [PASS] `spec_kit.specify.templates` → `.specify/templates`
  - directory
- [PASS] `spec_kit.specify.scripts` → `.specify/scripts`
  - directory
- [PASS] `spec_kit.specify.specs.README.md` → `.specify/specs/README.md`
- [PASS] `spec_kit.probe` → `integrations/spec-kit/probe.py`
  - {"code": "SPEC_KIT_UNAVAILABLE", "integration_status": "NATIVE_ONLY", "provider_status": "UNAVAILABLE"}
- [PASS] `superpowers.pinned.executing-plans` → `.agents/skills/executing-plans/SKILL.md`
- [PASS] `superpowers.pinned.subagent-driven-development` → `.agents/skills/subagent-driven-development/SKILL.md`
- [PASS] `superpowers.pinned.test-driven-development` → `.agents/skills/test-driven-development/SKILL.md`
- [PASS] `superpowers.pinned.systematic-debugging` → `.agents/skills/systematic-debugging/SKILL.md`
- [PASS] `superpowers.pinned.verification-before-completion` → `.agents/skills/verification-before-completion/SKILL.md`
- [PASS] `superpowers.shim.brainstorming` → `.agents/skills/brainstorming/SKILL.md`
- [PASS] `superpowers.shim.writing-plans` → `.agents/skills/writing-plans/SKILL.md`
- [PASS] `superpowers.shim.finishing-branch` → `.agents/skills/finishing-branch/SKILL.md`
- [PASS] `frontend_context.apps_registry` → `.agents/ges/frontend/apps-registry.json`
  - adoption_mode=ENFORCED
