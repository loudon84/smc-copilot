# smc-hermes-agent

> **FROZEN (v2.0)** — This OPSI Product is legacy. New Hermes deployments use
> `/api/v2/opsi` with signed Installer releases. The Product source, history,
> and OPSI enrollment assets are preserved for migration rollback. No new
> Production rollouts may use `.opsi` packaging or `productOnClient` mutations.

OPSI 4.3 `localboot` Product. PowerShell adapter is short-lived: no port, no Chat proxy.

Packaging (does not publish to production Depot):

```text
python infra/opsi/products/smc-hermes-agent/packaging/makepackage.py --smoke
```

Live `opsi-package-manager` install is an operator gate.
