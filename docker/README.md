# SMC Salt Server Deployment

Deployment root on `192.168.102.104`: `/data/salt-master`.

The stack keeps the existing Salt PKI, cache, state and pillar mounts and adds:

- Salt Master 3008.2 on `salt.superic.com:4505/4506`
- salt-api HTTPS on `salt.superic.com:8000`
- PostgreSQL 17 for Salt Control
- SMC Salt Control HTTPS on `salt.superic.com:8770`

## 1. Update deployment files

```bash
cd /data/salt-master/source/smc-copilot
git pull --ff-only

cd /data/salt-master
stamp="$(date +%Y%m%d-%H%M%S)"
cp Dockerfile "Dockerfile.${stamp}.bak"
cp docker-compose.yml "docker-compose.yml.${stamp}.bak"
cp .env ".env.${stamp}.bak"
cp source/smc-copilot/docker/Dockerfile .
cp source/smc-copilot/docker/SaltControl.Dockerfile .
cp source/smc-copilot/docker/docker-compose.yml .
cp source/smc-copilot/docker/.dockerignore .
cp source/smc-copilot/docker/salt-master-entrypoint.sh .
cp source/smc-copilot/docker/salt-control-entrypoint.sh .
cp source/smc-copilot/docker/server-deploy.sh .
cp source/smc-copilot/docker/create-enrollment-token.sh .
cp source/smc-copilot/docker/.env.example .env
chmod 0755 ./*.sh
```

Do not replace these existing directories:

```text
data/pki
data/cache
data/logs
srv/salt
srv/pillar
config/master.d
```

At container start, `security.conf`, `fileserver.conf`, `eauth.conf`, `salt-api.conf` and `ext-pillar.conf` are taken from the repository production release. Other files in `config/master.d` remain active.
The entrypoint removes the repository's stale `failover.conf`; this deployment remains single-Master at `salt.superic.com`.

## 2. Prepare directories and local secrets

```bash
cd /data/salt-master
./server-deploy.sh prepare
```

This creates random PostgreSQL, salt-api and internal JWT secrets when absent. It also creates empty placeholders for the Master OIDC token and Artifact public key. It never overwrites an existing secret.

Supply the remaining files:

```text
certs/fullchain.pem
certs/privkey.pem
secrets/artifact-ed25519-public-key.pem
secrets/salt-control-master-token
secrets/management-backend-token
secrets/artifact-store-token
secrets/secret-provider-token
```

Requirements:

- TLS certificate SAN contains `salt.superic.com`.
- Artifact public key matches `ARTIFACT_KEY_ID`.
- Master token is an OIDC service token accepted by Salt Control with `salt.master`, `salt.desired_state.read` and `salt.artifact.read` scopes.
- Backend, Artifact Store and Secret Provider token files contain the corresponding service credentials.
- Secret files are mode `0600`; `secrets/` is mode `0700`.

The `infra` phase only requires the TLS certificate and salt-api password. The Master token and Artifact public key must be populated before the `control` phase.

## 3. Complete `.env`

Replace every `REPLACE_WITH_*` value:

```bash
cd /data/salt-master
vi .env
```

Get the existing Master fingerprint without replacing PKI:

```bash
docker exec salt-master salt-key -F master
```

Use the SHA-256 master public-key fingerprint as `SALT_MASTER_FINGERPRINT=sha256:...`.

The following real HTTPS integrations must already exist before Salt Control starts:

- `OIDC_ISSUER` and `OIDC_JWKS_URL`
- `MANAGEMENT_BACKEND_URL`
- `ARTIFACT_STORE_URL`
- `SECRET_PROVIDER_URL`

## 4. Start PostgreSQL and upgrade Salt Master

```bash
cd /data/salt-master
./server-deploy.sh infra
docker compose --env-file .env ps
docker exec salt-master salt 'ITBJB0676' test.ping
```

This rebuilds the existing `salt-master-salt-master` image with salt-api. Existing Master PKI and accepted Minion keys remain mounted.

The Salt Master build context is `/data/salt-master`; `.dockerignore` ensures PKI, secrets and runtime data never enter the image build context.
Salt Control builds from `/data/salt-master/source/smc-copilot`; keep that checkout in place.

Verify salt-api:

```bash
curl --cacert certs/fullchain.pem \
  -sS https://salt.superic.com:8000/login \
  -H 'Accept: application/json' \
  -d username=salt_control \
  --data-urlencode "password=$(cat secrets/salt-api-password)" \
  -d eauth=pam
```

The response must contain a token. Do not save or paste that token into logs.

## 5. Start Salt Control

```bash
cd /data/salt-master
./server-deploy.sh control
docker compose --env-file .env ps
curl --cacert certs/fullchain.pem https://salt.superic.com:8770/salt/v1/health
curl --cacert certs/fullchain.pem https://salt.superic.com:8770/salt/v1/ready
```

`/ready` must report all of these as `ok`:

```text
db
backend
saltApi
artifact
secret
```

## 6. Publish the current SMC Salt release

Use the existing release procedure for `/data/salt-master/srv/salt`, then run:

```bash
docker exec salt-master salt-run fileserver.update
docker exec salt-master salt 'ITBJB0676' saltutil.sync_all
docker exec salt-master salt 'ITBJB0676' smc_hermes.loader_status
```

Do not run Hermes Highstate until Endpoint binding and `hermes.home` exist in Salt Control Desired State.

## 7. Create the first one-time enrollment token

```bash
cd /data/salt-master
./create-enrollment-token.sh default 3600
```

The plaintext token is shown once. Use it for the existing Minion identity-adoption flow, then accept the new `ep_*` key only after fingerprint comparison.

## Rollback

Before the first upgrade, keep a copy of the old image ID:

```bash
docker image inspect salt-master-salt-master:latest --format '{{.Id}}'
```

All persistent state stays under `/data/salt-master/data`, `/srv/salt`, `/srv/pillar` and `config/master.d`. Restoring the prior Compose/Dockerfile and image does not require replacing Master PKI.
