# Documentation index

## Architecture

- [Monorepo overview](architecture/monorepo.md)
- [Desktop ↔ Runtime boundary](architecture/desktop-runtime-boundary.md)
- [Contract generation flow](architecture/contract-flow.md)
- [Source import record](architecture/source-imports.json)

## ADRs

- [ADR-001 Monorepo](adr/ADR-001-monorepo.md)
- [ADR-002 Build isolation](adr/ADR-002-build-isolation.md)
- [ADR-003 Runtime contract](adr/ADR-003-runtime-contract.md)
- [ADR-004 Release versioning](adr/ADR-004-release-versioning.md)
- [ADR-005 Main-only client](adr/ADR-005-main-only-client.md)
- [ADR-026 Salt Endpoint Control Plane](adr/ADR-026-salt-endpoint-control-plane.md)
- [ADR-030 Runtime Endpoint Decommission](adr/ADR-030-runtime-endpoint-decommission.md)
- [ADR-031 OPSI parallel Endpoint Control Plane](adr/ADR-031-opsi-parallel-endpoint-control-plane.md)

## Project AGENTS

- Root routing: [`../AGENTS.md`](../AGENTS.md)
- Desktop: [`../apps/desktop/AGENTS.md`](../apps/desktop/AGENTS.md)
- Runtime: [`../services/runtime/AGENTS.md`](../services/runtime/AGENTS.md)
- Work: [`../apps/work/AGENTS.md`](../apps/work/AGENTS.md)
- Salt (v2.0): [`../infra/salt/README.md`](../infra/salt/README.md)

## OPSI (v1.0)

- [OPSI overview](opsi/README.md)
- [Action result transport](opsi/decisions/action-result-transport.md)
- [Machine/User bootstrap](opsi/decisions/machine-user-bootstrap.md)

## Salt (Work v2.0)

- [Salt overview](salt/README.md)
- [Canary runbook](salt/CANARY.md)
- [Go / No-Go](salt/GO-NO-GO.md)

## PRD

- Monorepo PRD v1.0: [`../prd/v1.0.md`](../prd/v1.0.md)
- Hermes Kanban v1.7: [`../prd/v1.7.md`](../prd/v1.7.md)（Runtime Kanban Facade + Desktop `modules/kanban`；KanbanTask ≠ WorkTask）
