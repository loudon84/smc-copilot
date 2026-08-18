#!/usr/bin/env sh
set -eu

VERSION="${1:-}"
RELEASE_ROOT="${RELEASE_ROOT:-/data/smc-release/work}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

# shellcheck disable=SC1091
. "${SCRIPT_DIR}/assert-work-release.sh"

if [ -z "${VERSION}" ]; then
  echo "Usage: rollback-work-stable.sh <version>" >&2
  exit 1
fi

TARGET_DIR="${RELEASE_ROOT}/releases/${VERSION}"
if [ ! -d "${TARGET_DIR}" ]; then
  echo "ROLLBACK_FAILED: RELEASE_NOT_FOUND" >&2
  exit 1
fi

if ! assert_work_release_dir "${VERSION}" "${TARGET_DIR}"; then
  echo "ROLLBACK_FAILED: RELEASE_GATE" >&2
  exit 1
fi

ln -s "releases/${VERSION}" "${RELEASE_ROOT}/stable.new"
mv -Tf "${RELEASE_ROOT}/stable.new" "${RELEASE_ROOT}/stable"
