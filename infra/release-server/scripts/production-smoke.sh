#!/usr/bin/env sh
# Production smoke for https://release.superic.com/work/stable/.
# Fails if DNS/TLS, latest.yml, Range, Cache-Control, or installer HEAD is wrong.

set -eu

BASE_URL="${1:-${SMC_WORK_RELEASE_BASE_URL:-https://release.superic.com}}"
LATEST_PATH="${2:-/work/stable/latest.yml}"
CURL="curl --fail --silent --show-error --max-time 30"

host="${BASE_URL#https://}"
host="${host#http://}"
host="${host%%/*}"

get_header() {
  printf '%s\n' "$1" | awk -v key="$2" 'BEGIN{IGNORECASE=1} tolower($0) ~ "^" tolower(key) ":" {sub(/^[^:]+:[[:space:]]*/, ""); print; exit}'
}

echo "DNS ${host}"
getent hosts "${host}" >/dev/null

echo "TLS ${BASE_URL}/healthz"
${CURL} --head "${BASE_URL}/healthz" >/dev/null

echo "GET ${BASE_URL}${LATEST_PATH}"
latest_headers="$(${CURL} --include --output /tmp/smc-work-latest.yml "${BASE_URL}${LATEST_PATH}")"
cache="$(get_header "${latest_headers}" "Cache-Control")"
case "${cache}" in
  *no-cache*) ;;
  *)
    echo "SMOKE_FAILED: latest.yml Cache-Control=${cache}" >&2
    exit 1
    ;;
esac
grep -q '^version:' /tmp/smc-work-latest.yml
grep -q '^path:' /tmp/smc-work-latest.yml
grep -q '^sha512:' /tmp/smc-work-latest.yml

installer_name="$(sed -n 's/^path:[[:space:]]*//p' /tmp/smc-work-latest.yml | head -n 1 | tr -d "\"'")"
installer_name="${installer_name##*/}"
installer_path="/work/stable/${installer_name}"

echo "HEAD ${BASE_URL}${installer_path}"
installer_headers="$(${CURL} --head "${BASE_URL}${installer_path}")"
length="$(get_header "${installer_headers}" "Content-Length")"
if [ -z "${length}" ] || [ "${length}" = "0" ]; then
  echo "SMOKE_FAILED: installer missing Content-Length" >&2
  exit 1
fi
installer_cache="$(get_header "${installer_headers}" "Cache-Control")"
case "${installer_cache}" in
  *immutable*) ;;
  *)
    echo "SMOKE_FAILED: installer Cache-Control=${installer_cache}" >&2
    exit 1
    ;;
esac

echo "Range ${BASE_URL}${installer_path}"
range_code="$(curl --silent --show-error --max-time 30 --output /dev/null --write-out '%{http_code}' -H 'Range: bytes=0-0' "${BASE_URL}${installer_path}")"
if [ "${range_code}" != "206" ] && [ "${range_code}" != "200" ]; then
  echo "SMOKE_FAILED: Range request status ${range_code}" >&2
  exit 1
fi

echo "SMOKE_OK ${BASE_URL}${LATEST_PATH}"
