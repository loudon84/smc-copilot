#!/usr/bin/env bash
set -euo pipefail
# Operator/CI Linux builder helper. Does not publish to Depot.
# Always goes through makepackage.py so stage verification and OPSI-aware
# read-back cannot be skipped.
#
# SMC Builder Python and OPSI native tooling are separate runtimes.
# Do not use the opsi Python package as a health check.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -x /opt/python312/bin/python3.12 ]]; then
  PYTHON="/opt/python312/bin/python3.12"
else
  PYTHON="${PYTHON:-python3}"
fi
"$PYTHON" --version
"$PYTHON" -c 'import cryptography; print(cryptography.__version__)'

for tool in opsi-makepackage opsi-package-manager opsi-cli; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "$tool not found; native OPSI tooling required" >&2
    exit 1
  fi
done
opsi-makepackage --version

HERMES_ZIP="${HERMES_ZIP:?hermes zip required}"
SIGNING_KEY_REF="${SIGNING_KEY_REF:?signing key required}"
DEST="${DEST:-$ROOT/dist}"
"$PYTHON" packaging/makepackage.py \
  --hermes-zip "$HERMES_ZIP" \
  --signing-key-ref "$SIGNING_KEY_REF" \
  --dest "$DEST" \
  --opsi-tooling native
ls -l "$DEST"/*.opsi
