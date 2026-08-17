# OPSI Linux Builder

Real `.opsi` packages are produced from a verified stage. SMC Builder Python (`/opt/python312/bin/python3.12` when present) signs the stage. OPSI native tooling (`opsi-makepackage`, `opsi-cli`, `opsi-package-manager`) is the package schema authority. Do not `import opsi` from Builder Python.

`python packaging/makepackage.py --hermes-zip ... --signing-key-ref ...` builds signed Runtime/Controller/release envelopes, validates `control.toml` with tomllib, then calls `opsi-makepackage`. CI smoke (`--smoke`) writes `.smoke.zip` only.

Never autogenerate a production private key. Never run `opsi-package-manager` from this script. See `docs/opsi/runbooks/v1.7-release-build.md` and `docs/opsi/runbooks/v1.7-depot-publish.md`.
