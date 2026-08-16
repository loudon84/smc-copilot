# ADR-033: OPSI Real Lab Assembly and Windows Runtime Trust

## Status

Accepted (OPSI v1.4 engineering). The Windows 10 Clean Endpoint remains `not_proven` until operator signoff; Windows 11 is outside the v1.4 certification matrix, and the Accelerated Pilot is deferred to v1.5.

## Context

v1.1–v1.3 delivered Action, Pilot, and Production Ring engineering, but `SMC_OPSI_ENV=lab` still assembled Fake RPC + Memory + seeded facts. Endpoint install checked signature length rather than Ed25519, resolved Hermes via PATH, wrote `owner=opsi` without Gateway health, and could not relay user-context continuation through OPSI instlog. Production Rings must stay frozen until a real Lab/Windows runtime is proven.

## Decision

1. Three exclusive assemblies:
   - `test`: `FakeOpsiJsonRpc` + Memory repositories + fixtures.
   - `lab`: `HttpOpsiJsonRpc` + company-internal PostgreSQL (isolated database/schema, least-privilege role) + Lab JWT; HTTPS RPC with optional explicit CA bundle; no silent TLS bypass.
   - `production`: `HttpOpsiJsonRpc` + company-internal PostgreSQL (isolated database/schema) + OIDC/JWKS + Secret Provider.
2. `build_test_state` / `build_lab_state` / `build_production_state` refuse cross-assembly types (Fake in lab/production, Memory/SQLite in lab/production). PostgreSQL is not installed on Windows Endpoints or the OPSI Server. OPSI Control must not access, join, or migrate OPSI's own database; platform backup/HA/monitoring stay with the internal DB team.
3. Inventory snapshots are persisted from OPSI RPC + operator Binding + Endpoint status evidence. No default OS/owner/disk/health/digest. Rollout/preflight read the repository, not `RolloutService.facts`.
4. Artifact envelope v2 is canonical JSON + artifact digest, signed Ed25519 with a fixed release key id. Endpoint verifies before extract. Smoke keys are `TEST-ONLY` and must not overwrite source/release keys.
5. Managed CLI is an absolute path under `versions\current` from the manifest entrypoint. Success paths must not use `Get-Command hermes`.
6. SID-scoped tasks `SMC-Hermes-User-Bootstrap-{SID}` and `SMC-Hermes-Gateway-{SID}` are registered and read back. JSON manifests cannot substitute for registration.
7. Owner commit is a transaction after CLI version, config check, Gateway start, and health. Failures restore previous owner/version/tasks.
8. User continuation writes a real OPSI client id outbox. Reconciler schedules a status poll; the next SYSTEM `custom=status` relays the marker into instlog. Result trust level is `OPSI_AUTHENTICATED_CHECKSUM`, not a device signature.
9. Pilot policy `accelerated-v1.4` (3–5 targets, Canary 2/4h, follow-on ≤3/1h, final 24h) is the v1.4 Gate. Legacy size/timing policies remain explicit but cannot satisfy that Gate.
10. Production Campaign start, stable promotion, and Ring advancement stay frozen until a persisted `v1.5-production-reentry` GO record exists. Cursor/fixtures must not write `proven/GO` in lab or production.

## Consequences

- `.env` / Runbooks that fill real opsiconfd credentials for `lab` now reach `HttpOpsiJsonRpc`.
- Clean enrollment uses baseline `ABSENT`; installed rollback uses `INSTALLED`; `salt`/`runtime` owners are `CONFLICT`.
- v1.1–v1.3 Evidence files remain `not_proven / NO-GO` and are not rewritten as complete.
- Work stays Direct Hermes. Salt and Runtime trees stay unmodified.
