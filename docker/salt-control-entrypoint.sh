#!/usr/bin/env bash
set -Eeuo pipefail

read_secret() {
  local variable="$1"
  local file_variable="${variable}_FILE"
  local file_path="${!file_variable:-}"
  if [[ -n "${file_path}" && -f "${file_path}" ]]; then
    printf -v "${variable}" '%s' "$(<"${file_path}")"
    export "${variable}"
  fi
}

reject_placeholder() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value}" || "${value}" == *REPLACE_WITH* || "${value}" == *example.invalid* ]]; then
    echo "${name} is missing or still a placeholder" >&2
    exit 2
  fi
}

read_secret DATABASE_PASSWORD
read_secret SALT_API_PASSWORD
read_secret JWT_LAB_SECRET
read_secret ARTIFACT_PUBLIC_KEY
read_secret MANAGEMENT_BACKEND_TOKEN
read_secret ARTIFACT_STORE_TOKEN
read_secret SECRET_PROVIDER_TOKEN

for secret_name in \
  DATABASE_PASSWORD SALT_API_PASSWORD JWT_LAB_SECRET ARTIFACT_PUBLIC_KEY \
  MANAGEMENT_BACKEND_TOKEN ARTIFACT_STORE_TOKEN SECRET_PROVIDER_TOKEN; do
  if [[ -z "${!secret_name:-}" ]]; then
    echo "${secret_name}_FILE is empty" >&2
    exit 2
  fi
done

for setting_name in \
  OIDC_ISSUER OIDC_JWKS_URL SALT_MASTERS SALT_MASTER_FINGERPRINTS \
  SALT_API_URLS MANAGEMENT_BACKEND_URL ARTIFACT_STORE_URL SECRET_PROVIDER_URL ARTIFACT_KEY_ID; do
  reject_placeholder "${setting_name}"
done

if [[ ! -s "${TLS_CERT_FILE:-}" || ! -s "${TLS_KEY_FILE:-}" ]]; then
  echo "Salt Control TLS certificate/key missing" >&2
  exit 2
fi

runtime_dir="/run/salt-control"
mkdir -p "${runtime_dir}"
install -o salt-control -g salt-control -m 0600 "${TLS_CERT_FILE}" "${runtime_dir}/fullchain.pem"
install -o salt-control -g salt-control -m 0600 "${TLS_KEY_FILE}" "${runtime_dir}/privkey.pem"

encoded_password="$(python -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["DATABASE_PASSWORD"], safe=""))')"
export DATABASE_URL="postgresql+asyncpg://${DATABASE_USER:-salt_control}:${encoded_password}@${DATABASE_HOST:-postgres}:${DATABASE_PORT:-5432}/${DATABASE_NAME:-salt_control}"
unset DATABASE_PASSWORD encoded_password

export HOME=/home/salt-control
gosu salt-control alembic upgrade head

exec gosu salt-control uvicorn main:app \
  --host 0.0.0.0 \
  --port 8770 \
  --workers 1 \
  --no-access-log \
  --ssl-certfile "${runtime_dir}/fullchain.pem" \
  --ssl-keyfile "${runtime_dir}/privkey.pem"
