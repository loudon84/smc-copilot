# SMC Copilot Repository Routing

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
- Work (v2.0): Endpoint Control Plane SOT is Salt (`infra/salt`); see ADR-026. `services/runtime` control plane is frozen (P0/P1 only). `apps/work` defaults to `direct` Hermes Gateway (`:8642`); Salt mode uses Availability; Runtime `:8765` only when `SMC_HERMES_CONTROL_OWNER=runtime`.
