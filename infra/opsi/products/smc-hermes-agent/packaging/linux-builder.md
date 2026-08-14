# OPSI Linux Builder

Real `.opsi` packages are produced on an OPSI 4.3 Linux builder with `opsi-makepackage`. CI smoke (`makepackage.py --smoke`) writes `.smoke.zip` only and must never be installed to Depot.

## Layout

Copy `infra/opsi/products/smc-hermes-agent` to the builder. `control.toml` `productVersion` must equal `CLIENT_DATA/artifacts/hermes-<version>-windows.manifest.json` `version`.

## Commands

```bash
cd smc-hermes-agent
opsi-makepackage
sha256sum *.opsi
```

CI uploads the artifact. Operators publish with `docs/opsi/runbooks/lab-depot-publish.md`. Never run `opsi-package-manager -i` from this script against production.
