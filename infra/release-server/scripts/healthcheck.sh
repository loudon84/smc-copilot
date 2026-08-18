#!/usr/bin/env sh
set -eu

BASE_URL="${1:-${SMC_WORK_RELEASE_BASE_URL:-https://127.0.0.1}}"
INSTALLER_PATH="${2:-${SMC_WORK_RELEASE_INSTALLER_PATH:-}}"

curl --fail --silent --show-error --head "${BASE_URL}/healthz" >/dev/null

if [ -n "${INSTALLER_PATH}" ]; then
  curl --fail --silent --show-error --head "${BASE_URL}${INSTALLER_PATH}" >/dev/null
fi
