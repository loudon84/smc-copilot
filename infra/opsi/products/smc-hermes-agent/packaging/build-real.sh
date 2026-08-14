#!/usr/bin/env bash
set -euo pipefail
# Operator/CI Linux builder helper. Does not publish to Depot.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if ! command -v opsi-makepackage >/dev/null 2>&1; then
  echo "opsi-makepackage not found; use packaging/makepackage.py --smoke on CI" >&2
  exit 1
fi
opsi-makepackage
ls -l ./*.opsi
