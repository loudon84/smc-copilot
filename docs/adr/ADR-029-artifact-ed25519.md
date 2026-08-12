# ADR-029: Hermes Artifact Ed25519 Signing

## Status

Accepted (PRD Work v2.2)

## Decision

1. Release CI produces canonical JSON manifest + SHA-256 + Ed25519 signature (`keyId`).
2. Signing private key lives only in Release Secret Store — not in Salt Control, Master, Minion, or git.
3. Clients embed `keyId` + Ed25519 public key; verify manifest signature then artifact SHA-256.
4. HMAC shared signing keys are forbidden in production (`SMC_SALT_ENV=production`).
5. Signature or checksum failure is fail-closed (no activate).

## Consequences

v2.1 HMAC lab helpers remain only when `SMC_SALT_ENV=lab|test`.
