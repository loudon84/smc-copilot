FROM ghcr.io/astral-sh/uv:0.11.29 AS uv

FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH=/app/.venv/bin:$PATH \
    PYTHONPATH=/app/src

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates gosu \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home --home-dir /home/salt-control salt-control

COPY --from=uv /uv /uvx /bin/

WORKDIR /app
COPY services/salt-control/pyproject.toml services/salt-control/uv.lock services/salt-control/README.md ./
COPY services/salt-control/alembic.ini ./alembic.ini
COPY services/salt-control/migrations ./migrations
COPY services/salt-control/src ./src
COPY docker/salt-control-entrypoint.sh /usr/local/bin/salt-control-entrypoint.sh

RUN uv sync --frozen --no-dev \
    && chmod 0755 /usr/local/bin/salt-control-entrypoint.sh \
    && chown -R salt-control:salt-control /app /home/salt-control

EXPOSE 8770
STOPSIGNAL SIGTERM

ENTRYPOINT ["/usr/local/bin/salt-control-entrypoint.sh"]
