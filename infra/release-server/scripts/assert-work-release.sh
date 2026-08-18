#!/usr/bin/env sh
# Shared final gate for promote/rollback. Verifies required artifacts, SHA256,
# latest.yml, and release-manifest.json before stable is allowed to move.

assert_work_release_dir() {
  VERSION="${1:-}"
  DIR="${2:-}"
  PRODUCTION_UPDATE_URL="https://release.superic.com/work/stable/"
  INSTALLER="smc-copilot-${VERSION}-setup.exe"

  if [ -z "${VERSION}" ] || [ -z "${DIR}" ]; then
    echo "RELEASE_GATE_FAILED: MISSING_ARGS" >&2
    return 1
  fi

  for file in \
    "${INSTALLER}" \
    "${INSTALLER}.blockmap" \
    "latest.yml" \
    "SHA256SUMS.txt" \
    "release-manifest.json"
  do
    if [ ! -f "${DIR}/${file}" ]; then
      echo "RELEASE_GATE_FAILED: MISSING_${file}" >&2
      return 1
    fi
  done

  (
    cd "${DIR}"
    sha256sum -c SHA256SUMS.txt >/dev/null
  )

  LATEST_VERSION="$(sed -n 's/^version:[[:space:]]*//p' "${DIR}/latest.yml" | head -n 1 | tr -d "\"'")"
  LATEST_PATH="$(sed -n 's/^path:[[:space:]]*//p' "${DIR}/latest.yml" | head -n 1 | tr -d "\"'")"
  LATEST_PATH_BASE="${LATEST_PATH##*/}"

  if [ "${LATEST_VERSION}" != "${VERSION}" ]; then
    echo "RELEASE_GATE_FAILED: LATEST_VERSION_MISMATCH" >&2
    return 1
  fi
  if [ "${LATEST_PATH_BASE}" != "${INSTALLER}" ]; then
    echo "RELEASE_GATE_FAILED: LATEST_PATH_MISMATCH" >&2
    return 1
  fi

  if ! grep -q "\"version\"[[:space:]]*:[[:space:]]*\"${VERSION}\"" "${DIR}/release-manifest.json"; then
    echo "RELEASE_GATE_FAILED: MANIFEST_VERSION_MISMATCH" >&2
    return 1
  fi
  if ! grep -q "${PRODUCTION_UPDATE_URL}" "${DIR}/release-manifest.json"; then
    echo "RELEASE_GATE_FAILED: MANIFEST_UPDATE_URL" >&2
    return 1
  fi
  if ! grep -q '"signed"[[:space:]]*:[[:space:]]*true' "${DIR}/release-manifest.json"; then
    echo "RELEASE_GATE_FAILED: MANIFEST_UNSIGNED" >&2
    return 1
  fi
}
