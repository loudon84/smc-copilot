#!/usr/bin/env sh
set -eu

VERSION="${1:-}"
STAGING_ID="${2:-}"
RELEASE_ROOT="${RELEASE_ROOT:-/data/smc-release/work}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

# shellcheck disable=SC1091
. "${SCRIPT_DIR}/assert-work-release.sh"

if [ -z "${VERSION}" ] || [ -z "${STAGING_ID}" ]; then
  echo "Usage: promote-work-release.sh <version> <staging-id>" >&2
  exit 1
fi

case "${VERSION}" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *)
    echo "PROMOTION_FAILED: INVALID_VERSION" >&2
    exit 1
    ;;
esac

STAGING_DIR="${RELEASE_ROOT}/staging/${STAGING_ID}"
RELEASES_DIR="${RELEASE_ROOT}/releases"
TARGET_DIR="${RELEASES_DIR}/${VERSION}"

if [ ! -d "${STAGING_DIR}" ]; then
  echo "PROMOTION_FAILED: STAGING_NOT_FOUND" >&2
  exit 1
fi

if ! assert_work_release_dir "${VERSION}" "${STAGING_DIR}"; then
  echo "PROMOTION_FAILED: RELEASE_GATE" >&2
  exit 1
fi

if [ -e "${TARGET_DIR}" ]; then
  echo "PROMOTION_FAILED: RELEASE_ALREADY_EXISTS" >&2
  exit 1
fi

mkdir -p "${RELEASES_DIR}"
mv "${STAGING_DIR}" "${TARGET_DIR}"
ln -s "releases/${VERSION}" "${RELEASE_ROOT}/stable.new"
mv -Tf "${RELEASE_ROOT}/stable.new" "${RELEASE_ROOT}/stable"
