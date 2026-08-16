# OPSI Linux Builder

Real `.opsi` packages are produced on an OPSI 4.3 Linux builder with `opsi-makepackage`. CI smoke (`makepackage.py --smoke`) writes `.smoke.zip` only, uses `TEST-ONLY` keys in the dest tree, and must never rewrite source release keys or be installed to Depot.

## Inputs

Release path requires a real Hermes Windows zip and an external Ed25519 signing key ref. The builder must not autogenerate a release private key.

## Commands

```bash
cd smc-hermes-agent
python packaging/makepackage.py --hermes-zip /secure/hermes-windows.zip --signing-key-ref /secure/release.key
opsi-makepackage
sha256sum *.opsi
```

CI uploads the artifact. Operators publish with `docs/opsi/runbooks/lab-depot-publish.md` and `docs/opsi/runbooks/v1.4-linux-builder.md`. Never run `opsi-package-manager -i` from this script against production.

