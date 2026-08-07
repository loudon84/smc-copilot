# ADR-004: Independent Desktop / Runtime / Contracts Versions

## Status

Accepted

## Context

A single product semver cannot express Desktop installer compatibility with Runtime service releases.

## Decision

Publish independent versions and tags:

- Desktop: `apps/desktop/package.json` → `desktop-vX.Y.Z`
- Runtime: `services/runtime/pyproject.toml` → `runtime-vX.Y.Z`
- Contracts: `contracts/version.json` → `contracts-vX.Y.Z`

Compatibility is declared in `contracts/version.json` and release manifests.

## Consequences

- Releases can roll Desktop without forcing Runtime.
- Runtime rollback must honor the contract compatibility matrix.
