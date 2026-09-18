# SMC Copilot Repository Routing

For non-trivial feature or architecture changes:

1. Ground requirements against current source.
2. Produce PRD-DRAFT.
3. Run independent PRD review.
4. Planning requires PRD status APPROVED.
5. Cursor implementation requires an approved `.plan.md`.
6. Existing repository routing and subsystem `AGENTS.md` remain authoritative.

- Desktop task:
  read `apps/desktop/AGENTS.md`

- Work (hermes-desktop next) task:
  read `apps/work/AGENTS.md`；dev: `npm run dev:work`

- Runtime task:
  read `services/runtime/AGENTS.md`

- API or event change:
  read `contracts/` and `docs/architecture/contract-flow.md` first

- Cross-project task:
  inspect contract before implementation

- Never scan references, build outputs, runtime data or archived PRDs
  unless explicitly requested.

- Desktop is a Runtime Client; Agent control plane for Desktop remains `services/runtime` (v1.4 / v1.4.1).
- Desktop must not listen on Agent ports (`18781` removed); Connection Ready follows `readiness.service` only.
- Work (v2.1/v2.2): Endpoint Control Plane **default** SOT is Salt (`infra/salt`) + `services/salt-control`; see ADR-026. Customers may choose a parallel OPSI provider (`infra/opsi` + `services/opsi-control`); see ADR-031. `services/runtime` control plane is frozen (P0/P1 only); decommission via `SMC_RUNTIME_ENDPOINT_CONTROL_ENABLED=false` after Ring 3 (410 on endpoint routes; Chat/Task retained). `apps/work` defaults to `direct` Hermes Gateway (`:8642`); enterprise Bootstrap writes `control-owner=salt` or `{ "hermes": "opsi" }` (Availability only); Runtime `:8765` only when `SMC_HERMES_CONTROL_OWNER=runtime`.
- OPSI task: read `docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md` and `docs/opsi/`. Do not modify `infra/salt`, `services/salt-control`, or `contracts/salt-control-api` for OPSI features. Do not add OPSI capability to `services/runtime` or `contracts/runtime-api`.
<!-- ges:v6:engineering-stack:begin -->

## AI Engineering Stack

Discovery / requirement grilling:
grill-with-docs
grilling
domain-modeling

Architecture / codebase design:
codebase-design

Work decomposition:
to-tickets

Project principles / constitution:
speckit-constitution

Feature specification:
speckit-specify

Requirement clarification:
speckit-clarify

Technical intent planning:
speckit-plan

Implementation plan methodology:
writing-plans

Execution:
subagent-driven-development

TDD:
test-driven-development

Debug:
systematic-debugging

Review:
requesting-code-review
receiving-code-review

Completion:
verification-before-completion
finishing-a-development-branch

GES manages composition and governance metadata.
GES does not generate Specs, implementation plans or code.

<!-- ges:v6:engineering-stack:end -->

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

multi-context: a root `CONTEXT-MAP.md` points at per-context `CONTEXT.md` files. See `docs/agents/domain.md`.
