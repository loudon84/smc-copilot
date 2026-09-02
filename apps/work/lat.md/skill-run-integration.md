# Skill-first Run Integration

The approved v4.0.1 target adds a Layout-level Skill entry while keeping Chat, Session, and File Platform as the existing product owners. Production integration remains gated on a complete tagged NoDeskClaw consumer contract.

## Approved target

Skill execution is a per-tab Chat mode, not a new View or duplicate Chat surface.

`Layout` and `ChatRun` own the live execution mode, while the mounted `Chat` remains the only Skill selection and submit owner. Each submit freezes a tool/request snapshot; the Renderer tab id, client request id, and Provider run id never alias one another.

The target path is Layout → existing Chat UI → Main Skill Run service → NoDeskClaw Backend → Agent Run fact source → Main projection → existing Chat and [[file-platform|File Platform]]. Work never connects directly to the Agent.

## Ownership boundaries

The architecture extends existing owners and adds one dedicated Main lifecycle owner without creating parallel Session or File stores.

- Main owns Backend auth transport, Skill Run lifecycle, SSE/poll recovery, idempotency, continuation, contract parsing, and sanitized IPC projection.
- Renderer owns Catalog and activity presentation only; it does not receive raw Provider events, URLs, credentials, or Artifact bytes.
- Existing Session/continuation persists mode, transcript, and non-terminal recovery rather than adding a Skill conversation database.
- [[file-platform|File Platform]] remains the only Artifact preview, download, Save As, materialize, and Session Files owner.
- [[expert-execution|Expert execution]] remains an explicit compatibility reader during migration; Skill failure never silently falls back to Expert.
- Local Chat, Runtime ChatRun, and the local bundled Skills management screen remain separate capabilities.

## Provider contract gate

Real Skill Run start stays disabled until Work locks an immutable tagged contract that is sufficient for deterministic parsing and security enforcement.

The gate requires a Skill-only Catalog discriminator, Public Run view, Result and Artifact envelopes, event discriminated union, SSE auth/replay semantics, idempotency semantics, endpoint/error fixtures, and later Approval or Attachment contracts before those controls are enabled.

The v1.2.1 Bundle is locked, but RM-01 controlled live replay remains deferred pending a Provider-published prompt-first Skill and manual verification. That deferral permits only M1 dark Main/Preload foundation and M2 safe selection work; RM-04 real execution and production promotion remain blocked by RM-01.

## Delivery sequence

The roadmap follows contract-first vertical slices so each checkpoint preserves the approved ownership model.

1. Lock the Provider contract Bundle; complete controlled live replay before real execution.
2. While that live verification is pending, add or validate only the shared authorized transport and dark Main/IPC foundation.
3. Add Layout mode, Catalog, selection, and Composer capability projection without enabling real submission.
4. After live replay passes, add start, recovery, cancel, queue, final Result, and durable continuation.
5. Add run-scoped remote Artifact identity through File Platform.
6. Pilot, promote to production default, then plan P1 and Expert removal separately.

## Source documents

The PRD is the architecture authority and the ROADMAP is the delivery-order authority.

- [Approved PRD](../../../docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md)
- [Delivery ROADMAP](../../../docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md)
