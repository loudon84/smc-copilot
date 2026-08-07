# ADR-001: Merge into a Repository Monorepo

## Status

Accepted

## Context

Desktop and Runtime lived in separate repositories, causing API drift, duplicate DTO definitions, and split CI/review loops.

## Decision

Use a Repository Monorepo (`smc-copilot`) that unifies Git history, contracts, CI, and agent context while keeping build systems isolated.

## Consequences

- Atomic cross-project commits become possible.
- Desktop/Runtime keep independent npm/uv toolchains and versions.
- Old source repositories should become read-only after cutover.
