# Salt Lab

Optional live Master via Docker. Extension unit tests do not need this.

## Bring up Master

```bash
docker compose up -d
```

## Windows Minion (optional)

1. Install Salt Minion 3007+ for Windows.
2. Copy `minion.conf.example` to the minion config and set `master` to the lab host.
3. `salt-key -L` on master; accept `lab-minion-01`.
4. `salt '*' saltutil.sync_all`
5. `salt '*' smc_hermes.inspect`
6. `salt '*' state.apply`

## Fixture-only path

Use `uv run pytest` under `infra/salt` without Docker.
