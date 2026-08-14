#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "${script_dir}"

mode="${1:-status}"
compose=(docker compose --env-file .env)

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "required command missing: $1" >&2
    exit 2
  }
}

secret_file() {
  printf '%s/secrets/%s' "${script_dir}" "$1"
}

generate_secret() {
  local name="$1"
  local target
  target="$(secret_file "${name}")"
  if [[ ! -s "${target}" ]]; then
    openssl rand -base64 48 | tr -d '\n' >"${target}"
    chmod 0600 "${target}"
    echo "created secrets/${name}"
  fi
}

assert_file() {
  local path="$1"
  if [[ ! -s "${path}" ]]; then
    echo "required file missing or empty: ${path}" >&2
    exit 2
  fi
}

assert_env_ready() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value}" || "${value}" == *REPLACE_WITH* ]]; then
    echo "${name} is missing or still a placeholder in .env" >&2
    exit 2
  fi
}

load_env() {
  set -a
  # shellcheck disable=SC1091
  source ./.env
  set +a
}

wait_healthy() {
  local service="$1"
  local container="$2"
  local attempts="${3:-60}"
  for ((i = 1; i <= attempts; i++)); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container}" 2>/dev/null || true)"
    if [[ "${status}" == "healthy" || "${status}" == "running" ]]; then
      echo "${service}: ${status}"
      return 0
    fi
    if [[ "${status}" == "unhealthy" || "${status}" == "exited" ]]; then
      "${compose[@]}" logs --tail=100 "${service}" >&2
      return 1
    fi
    sleep 2
  done
  "${compose[@]}" logs --tail=100 "${service}" >&2
  echo "${service} did not become healthy" >&2
  return 1
}

prepare() {
  require_command docker
  require_command openssl
  mkdir -p \
    certs secrets config/master.d srv/salt srv/pillar \
    data/cache data/generated/master.d data/logs data/pki data/postgres
  chmod 0700 secrets
  generate_secret postgres-password
  generate_secret salt-api-password
  generate_secret jwt-internal-secret
  touch secrets/salt-control-master-token secrets/artifact-ed25519-public-key.pem
  touch secrets/management-backend-token secrets/artifact-store-token secrets/secret-provider-token
  chmod 0600 \
    secrets/salt-control-master-token secrets/artifact-ed25519-public-key.pem \
    secrets/management-backend-token secrets/artifact-store-token secrets/secret-provider-token
  echo "Preparation complete. Supply TLS, OIDC token, Artifact public key and replace .env placeholders."
}

start_infra() {
  assert_file secrets/postgres-password
  assert_file secrets/salt-api-password
  assert_file certs/fullchain.pem
  assert_file certs/privkey.pem
  "${compose[@]}" config --quiet
  "${compose[@]}" build salt-master
  "${compose[@]}" up -d postgres salt-master
  wait_healthy postgres salt-control-postgres
  wait_healthy salt-master salt-master
}

start_control() {
  load_env
  for name in \
    SALT_MASTER_FINGERPRINT OIDC_ISSUER OIDC_JWKS_URL \
    MANAGEMENT_BACKEND_URL ARTIFACT_STORE_URL SECRET_PROVIDER_URL ARTIFACT_KEY_ID; do
    assert_env_ready "${name}"
  done
  assert_file secrets/jwt-internal-secret
  assert_file secrets/salt-control-master-token
  assert_file secrets/artifact-ed25519-public-key.pem
  assert_file secrets/management-backend-token
  assert_file secrets/artifact-store-token
  assert_file secrets/secret-provider-token
  # Regenerate the Master runtime config before Salt Control readiness probes salt-api.
  "${compose[@]}" up -d --force-recreate salt-master
  wait_healthy salt-master salt-master
  "${compose[@]}" build salt-control
  "${compose[@]}" up -d salt-control
  wait_healthy salt-control salt-control 90
}

case "${mode}" in
  prepare)
    prepare
    ;;
  infra)
    require_command docker
    start_infra
    ;;
  control)
    require_command docker
    start_control
    ;;
  full)
    require_command docker
    start_infra
    start_control
    ;;
  status)
    require_command docker
    "${compose[@]}" ps
    ;;
  *)
    echo "usage: $0 {prepare|infra|control|full|status}" >&2
    exit 2
    ;;
esac
