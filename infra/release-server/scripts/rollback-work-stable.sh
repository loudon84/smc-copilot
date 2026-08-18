#!/usr/bin/env sh
set -eu

VERSION="${1:-}"
RELEASE_ROOT="${RELEASE_ROOT:-/data/smc-release/work}"

if [ -z "${VERSION}" ]; then
  echo "Usage: rollback-work-stable.sh <version>" >&2
  exit 1
fi

TARGET_DIR="${RELEASE_ROOT}/releases/${VERSION}"
if [ ! -d "${TARGET_DIR}" ]; then
  echo "ROLLBACK_FAILED: RELEASE_NOT_FOUND" >&2
  exit 1
fi

ln -s "releases/${VERSION}" "${RELEASE_ROOT}/stable.new"
mv -Tf "${RELEASE_ROOT}/stable.new" "${RELEASE_ROOT}/stable"
