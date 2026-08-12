# ADR-030: Runtime Endpoint Control Plane Decommission Boundary

## Status

Accepted (PRD Work v2.2) — execution gated on Ring 3 × 30 days SLO

## Decision

1. Only Endpoint Control Plane routes/workers/installers/supervisors are retired.
2. Chat, Task, Approval, Kanban, Memory, Attachment, Workspace remain.
3. Feature flag `SMC_RUNTIME_ENDPOINT_CONTROL_ENABLED=false` returns `410 runtime_endpoint_control_decommissioned` for Endpoint APIs; business APIs stay up.
4. Full source deletion happens only after 30-day Ring 3 evidence; until then flag-off is the production posture.
5. Rollback keeps a signed Runtime rollback bundle for one release cycle.

## Consequences

Inventory continues to measure Endpoint replacement. Mis-deleting Chat/Task is a P0.
