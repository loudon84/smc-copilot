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

read_secret SALT_API_PASSWORD

: "${SMC_SALT_CONTROL_URL:=https://salt.superic.com:8770}"
: "${SMC_SALT_CONTROL_TOKEN_FILE:=/run/secrets/salt_control_master_token}"
: "${SMC_ARTIFACT_PUBLIC_KEY_FILE:=/run/secrets/artifact_public_key}"

if [[ -z "${SALT_API_PASSWORD:-}" ]]; then
  echo "SALT_API_PASSWORD_FILE is empty" >&2
  exit 2
fi
if [[ ! -s /etc/salt/pki/api/salt-api.crt || ! -s /etc/salt/pki/api/salt-api.key ]]; then
  echo "salt-api TLS certificate/key missing" >&2
  exit 2
fi

api_user="${SALT_API_USERNAME:-salt_control}"
if [[ "${api_user}" != "salt_control" ]]; then
  echo "SALT_API_USERNAME must be salt_control to match the eAuth policy" >&2
  exit 2
fi
if ! id "${api_user}" >/dev/null 2>&1; then
  useradd --create-home --shell /usr/sbin/nologin "${api_user}"
fi
printf '%s:%s\n' "${api_user}" "${SALT_API_PASSWORD}" | chpasswd
unset SALT_API_PASSWORD

runtime_dir=/etc/salt/master.d
mkdir -p "${runtime_dir}"
find "${runtime_dir}" -mindepth 1 -maxdepth 1 -type f -name '*.conf' -delete

# Copy server-local settings except files managed by the production release.
if compgen -G '/opt/smc/master.d-host/*.conf' >/dev/null; then
  for source_config in /opt/smc/master.d-host/*.conf; do
    config_name="$(basename "${source_config}")"
    case "${config_name}" in
      security.conf|fileserver.conf|eauth.conf|salt-api.conf|ext-pillar.conf)
        continue
        ;;
    esac
    cp "${source_config}" "${runtime_dir}/${config_name}"
  done
fi

for config_name in security.conf fileserver.conf eauth.conf salt-api.conf; do
  if [[ -f "/opt/smc/master.d-repo/${config_name}" ]]; then
    cp "/opt/smc/master.d-repo/${config_name}" "${runtime_dir}/${config_name}"
  fi
done

# This deployment is intentionally single-Master. Remove stale multimaster templates.
rm -f "${runtime_dir}/failover.conf"

cat >"${runtime_dir}/10-smc-roots.conf" <<'EOF'
file_roots:
  base:
    - /srv/salt
pillar_roots:
  base:
    - /srv/pillar
EOF

cat >"${runtime_dir}/40-smc-ext-pillar.conf" <<EOF
ext_pillar:
  - smc_external:
      salt_control_url: "${SMC_SALT_CONTROL_URL:-}"
      token_file: "${SMC_SALT_CONTROL_TOKEN_FILE:-}"
      trusted_key_id: "${SMC_ARTIFACT_KEY_ID:-}"
      trusted_public_key_file: "${SMC_ARTIFACT_PUBLIC_KEY_FILE:-}"
EOF

if [[ ! -s "${SMC_SALT_CONTROL_TOKEN_FILE}" || ! -s "${SMC_ARTIFACT_PUBLIC_KEY_FILE}" || -z "${SMC_ARTIFACT_KEY_ID:-}" || "${SMC_ARTIFACT_KEY_ID}" == *REPLACE_WITH* ]]; then
  rm -f "${runtime_dir}/40-smc-ext-pillar.conf"
  echo "Salt Control integration is not configured; External Pillar remains disabled during infrastructure phase" >&2
fi

chmod 0600 /etc/salt/pki/api/salt-api.key
salt-master --versions-report
salt-master -l info &
master_pid=$!
salt-api -l info &
api_pid=$!

terminate() {
  kill -TERM "${api_pid}" "${master_pid}" 2>/dev/null || true
  wait "${api_pid}" "${master_pid}" 2>/dev/null || true
}
trap terminate TERM INT EXIT

while kill -0 "${master_pid}" 2>/dev/null && kill -0 "${api_pid}" 2>/dev/null; do
  sleep 2
done

echo "salt-master or salt-api stopped unexpectedly" >&2
exit 1
