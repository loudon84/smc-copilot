#!/usr/bin/env bash
set -euo pipefail
# Operator/CI Linux builder helper. Does not publish to Depot.
# Always goes through makepackage.py so stage verification and OPSI-aware
# read-back cannot be skipped.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if ! command -v opsi-makepackage >/dev/null 2>&1; then
  echo "opsi-makepackage not found; native tooling required (no zipfile .opsi)" >&2
  exit 1
fi
HERMES_ZIP="${HERMES_ZIP:?hermes zip required}"
SIGNING_KEY_REF="${SIGNING_KEY_REF:?signing key required}"
DEST="${DEST:-$ROOT/dist}"
python3 packaging/makepackage.py \
  --hermes-zip "$HERMES_ZIP" \
  --signing-key-ref "$SIGNING_KEY_REF" \
  --dest "$DEST" \
  --opsi-tooling native
ls -l "$DEST"/*.opsi
