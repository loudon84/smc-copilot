# OPSI Linux Builder

Real `.opsi` packages are produced from a verified stage. `python packaging/makepackage.py --hermes-zip ... --signing-key-ref ...` builds signed Runtime/Controller/release envelopes and a stage tree. Operators may run `opsi-makepackage` on that stage. CI smoke (`--smoke`) writes `.smoke.zip` only.

Never autogenerate a production private key. Never run `opsi-package-manager` from this script. See `docs/opsi/runbooks/v1.7-release-build.md` and `docs/opsi/runbooks/v1.7-depot-publish.md`.
