FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive
ARG SALT_VERSION=3008.2

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       curl \
       gettext-base \
       gnupg \
       passwd \
       procps \
    && mkdir -m 755 -p /etc/apt/keyrings \
    && curl -fsSL \
       https://packages.broadcom.com/artifactory/api/security/keypair/SaltProjectKey/public \
       | gpg --dearmor > /etc/apt/keyrings/salt-archive-keyring.pgp \
    && curl -fsSL \
       https://github.com/saltstack/salt-install-guide/releases/latest/download/salt.sources \
       > /etc/apt/sources.list.d/salt.sources \
    && printf 'Package: salt-*\nPin: version 3008.*\nPin-Priority: 1001\n' \
       > /etc/apt/preferences.d/salt-pin-1001 \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       salt-common=${SALT_VERSION} \
       salt-master=${SALT_VERSION} \
       salt-api=${SALT_VERSION} \
    && mkdir -p /etc/salt/pki/api \
    && rm -rf /var/lib/apt/lists/*

COPY salt-master-entrypoint.sh /usr/local/bin/salt-master-entrypoint.sh
RUN chmod 0755 /usr/local/bin/salt-master-entrypoint.sh

EXPOSE 4505 4506 8000

STOPSIGNAL SIGTERM

ENTRYPOINT ["/usr/local/bin/salt-master-entrypoint.sh"]
