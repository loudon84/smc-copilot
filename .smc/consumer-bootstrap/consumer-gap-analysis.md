# Consumer Gap Analysis

- Project: `E:\git\smc-copilot`
- Analyzed at: `2026-09-15T02:44:31Z`
- Overall: `GAPS`

## Layers

### ges

- Verdict: `PASS`
- Missing: none

### spec_kit

- Verdict: `MISSING`
- Missing:
  - `spec_kit.specify.constitution.md`
  - `spec_kit.specify.templates`
  - `spec_kit.specify.scripts`
  - `spec_kit.specify.specs.README.md`
- Note: provider_status=UNAVAILABLE
- Note: integration_status=NATIVE_ONLY

### superpowers

- Verdict: `PARTIAL`
- Missing:
  - `superpowers.shim.writing-plans`
  - `superpowers.shim.finishing-branch`

### frontend_context

- Verdict: `PASS`
- Missing: none

## Claims

- `frontend_context`: `GES_NATIVE`
- `ges`: `GES_NATIVE`
- `spec_kit_provider`: `NATIVE_ONLY`
- `spec_kit_scaffold`: `UNAVAILABLE`
- `superpowers_pinned`: `UPSTREAM_PINNED`
- `superpowers_shims`: `GES_NATIVE`

## Codes

- `SPEC_KIT_PROVIDER_UNAVAILABLE`
- `LAYER_MISSING:spec_kit`
- `SUPERPOWERS_CAPABILITY_GAP`
- `LAYER_PARTIAL:superpowers`
- `CONSUMER_GAP_PRESENT`
