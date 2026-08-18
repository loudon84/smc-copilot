#!/usr/bin/env sh
set -eu

VERSION="${1:-}"
STAGING_ID="${2:-}"
RELEASE_ROOT="${RELEASE_ROOT:-/data/smc-release/work}"

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

for file in \
  "smc-work-${VERSION}-setup.exe" \
  "smc-work-${VERSION}-setup.exe.blockmap" \
  "latest.yml" \
  "SHA256SUMS.txt" \
  "release-manifest.json"
do
  if [ ! -f "${STAGING_DIR}/${file}" ]; then
    echo "PROMOTION_FAILED: MISSING_${file}" >&2
    exit 1
  fi
done

(
  cd "${STAGING_DIR}"
  sha256sum -c SHA256SUMS.txt >/dev/null
)

if [ -e "${TARGET_DIR}" ]; then
  echo "PROMOTION_FAILED: RELEASE_ALREADY_EXISTS" >&2
  exit 1
fi

mkdir -p "${RELEASES_DIR}"
mv "${STAGING_DIR}" "${TARGET_DIR}"
ln -s "releases/${VERSION}" "${RELEASE_ROOT}/stable.new"
mv -Tf "${RELEASE_ROOT}/stable.new" "${RELEASE_ROOT}/stable"
