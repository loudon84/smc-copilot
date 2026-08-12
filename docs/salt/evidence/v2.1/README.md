# v2.1 baseline evidence (repo-only)

Captured during PRD v2.2 Phase 0.

## Inventory

See `migration-inventory.json` / `migration-inventory.md` in this directory.

```text
Endpoint API           92.1%
Endpoint Service       90.3%
Endpoint LOC           94.1%
Inventory decision     GO (static/repo evidence only)
Hardware Canary        NOT PROVEN
Production rollout     NO-GO (requires v2.2)
```

## Salt pytest

```text
61 passed (infra/salt v2.1 suite)
```

## Windows Case template

Use [CANARY-v2.1.md](../../CANARY-v2.1.md). Real A–F results for v2.2 live under `docs/salt/evidence/v2.2/<ring>/<date>/`.
