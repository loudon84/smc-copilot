#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
CERT_DIR="${SCRIPT_DIR}/../certs"

mkdir -p "${CERT_DIR}"

openssl req \
  -x509 \
  -newkey rsa:2048 \
  -sha256 \
  -days 365 \
  -nodes \
  -subj "/CN=localhost" \
  -keyout "${CERT_DIR}/release.key" \
  -out "${CERT_DIR}/release.crt"

echo "Generated dev TLS certs in ${CERT_DIR}"
