# ADR-034: OPSI Production Re-entry and Authoritative Rings

## Status

Accepted (OPSI v1.5 engineering). Live Accelerated Pilot and Controlled Production Re-entry remain `not_proven` until operator signoff. Cursor/CI must not write `proven` or `GO`.

## Context

ADR-032 delivered Production Rings as an engineering directory. ADR-033 connected Lab/Windows runtime trust. v1.5 closes the remaining gap: Rollout still treated in-memory `facts` as success, observation started before Target HEALTHY, Depot attestation checked signature length, and production had no signed `v1.5-production-reentry` import/revoke path.

## Decision

1. **TargetVerification is the apply/rollback source of truth.** A persisted record binds `campaignId/clientId/actionId/kind` to Action Result, ProductOnClient read-back, fresh Inventory, and a Work smoke reference/digest. Same canonical digest is idempotent; a different digest is conflict. opsi-control stores the Work evidence reference only and never connects to Work.
2. **Ring state is a single recoverable SOT** in `rollout_rings`. Batches are an API compatibility projection. Observation starts only after every current-ring Target is HEALTHY; `observe_started_at = max(target.healthy_at)` and `observe_until` are persisted. Next Ring requires predecessor PASSED, elapsed deadline, fresh preflight, mapping/attestation, triple approval on the current fencing revision, and an active signed live Gate.
3. **Depot Attestation v2** is canonical JSON + Ed25519. It binds depot, Product versions, artifact digest, runtime envelope manifest digest, Hermes signer key id, ProductOnDepot read-back digest, issuer/key id, expiry, and evidence ref. Request bodies do not supply trusted public keys. Tamper, expiry, revoke, or read-back drift quarantines the artifact and may freeze.
4. **Signed live Gate import/revoke** is the only production unfreeze path. The service verifies allowlisted Operator Ed25519 signatures. It never self-signs GO. Test-only seed remains available in `opsi_env=test` for historical Pilot gates; production seed, request-body `decision=GO`, and env flags cannot unfreeze `v1.5-production-reentry`.
5. **Windows 10-only validation matrix.** v1.4 Live Gate is `v1.4-win10-clean-endpoint`. v1.5 Live authorizes 21–50 endpoints and 1–2 Depots with policy `controlled-reentry-v1.5`. Engineering load `engineering-v1.3` (500/8) remains automated only and cannot satisfy the Live Gate. Existing Windows 11 compatibility logic is unchanged; no new Windows 11 reject branch is added. Human evidence uses Windows 10 devices only.
6. **Isolation is unchanged.** Work stays Direct Hermes `:8642`. Control talks only to opsiconfd JSON-RPC. Company-internal PostgreSQL stays isolated from the OPSI Server database. Salt and Runtime trees are not modified.

## Consequences

- Production start, stable promotion, and next Ring stay 412 until a persisted, unexpired, unrevoked `v1.5-production-reentry` GO envelope exists.
- Evidence Manifest v3 is recomputed from PostgreSQL events/verifications/rings/attestations/freezes. Service verification tops out at `verified`; decision defaults to `NO-GO`.
- Phase 8 (3–5 Windows 10 accelerated Pilot) and Phase 9 (21–50 / 1–2 Depot + 7-Day) are operator Evidence only.
