# smc-hermes-agent

OPSI 4.3 `localboot` Product. PowerShell adapter is short-lived: no port, no Chat proxy.

Packaging (does not publish to production Depot):

```text
python infra/opsi/products/smc-hermes-agent/packaging/makepackage.py --smoke
```

Live `opsi-package-manager` install is an operator gate.
