# Method Provider Contract (Superpowers)

Superpowers is a versioned **method provider** under GES execution control. Claim state for this package: `UPSTREAM_PINNED`.

## Ownership

- `smc-plan-delivery` remains the sole governed delivery orchestrator.
- Provider results are untrusted proposals; GES independently rechecks workspace, method gates, and evidence.
- Provider self-reported PASS never substitutes for GES Final Evidence.

## Forbidden provider writes

Provider has no write authority over:

- canonical Plan structure or Todo identity
- Delivery State ledger
- Completion Audit verdict
- Implementation Review verdict
- Final Evidence verdict
- implementation commit
- Roadmap status
- install/rollback receipt

Out-of-scope writes yield `SUPERPOWERS_SCOPE_VIOLATION` / `DELIVERY_SCOPE_DRIFT`.

## Provenance

See `engineeing-skills/integrations/superpowers/upstream-provenance.json` for upstream repo, pinned commit, path, sha256, license, and local adaptation digests.

## Vocabulary

`INSPIRED` | `ADAPTER_READY` | `UPSTREAM_PINNED` | `EXTERNAL_VERIFIED` — do not use "integrated" as a synonym.
