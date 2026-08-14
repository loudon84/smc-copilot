#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "${script_dir}"

tenant_id="${1:-default}"
ttl_seconds="${2:-3600}"
if [[ ! "${ttl_seconds}" =~ ^[0-9]+$ ]] || ((ttl_seconds < 60)); then
  echo "TTL must be an integer of at least 60 seconds" >&2
  exit 2
fi

set -a
# shellcheck disable=SC1091
source ./.env
set +a

token="$(openssl rand -hex 32)"
token_hash="$(printf '%s' "${token}" | sha256sum | awk '{print $1}')"

docker compose --env-file .env exec -T postgres \
  psql --set=ON_ERROR_STOP=1 \
    --username "${POSTGRES_USER:-salt_control}" \
    --dbname "${POSTGRES_DB:-salt_control}" \
    --set=token_hash="${token_hash}" \
    --set=tenant_id="${tenant_id}" \
    --set=ttl_seconds="${ttl_seconds}" <<'SQL'
INSERT INTO enrollment_tokens (token_hash, tenant_id, expires_at, used, created_at)
VALUES (
  :'token_hash',
  :'tenant_id',
  now() + (:'ttl_seconds' || ' seconds')::interval,
  false,
  now()
);
SQL

printf 'Enrollment token (shown once): %s\nTenant: %s\nTTL: %s seconds\n' "${token}" "${tenant_id}" "${ttl_seconds}"
