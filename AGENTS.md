# SMC Copilot Repository Routing

- Desktop task:
  read `apps/desktop/AGENTS.md`

- Runtime task:
  read `services/runtime/AGENTS.md`

- API or event change:
  read `contracts/` and `docs/architecture/contract-flow.md` first

- Cross-project task:
  inspect contract before implementation

- Never scan references, build outputs, runtime data or archived PRDs
  unless explicitly requested.

- Desktop is a Runtime Client; Agent control plane is `services/runtime` only (v1.4).
