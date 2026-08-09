# ADR-023: Hermes Local Configuration Source of Truth

## Status

Accepted (PRD v1.5.3 Hotfix)

## Context

Runtime previously generated and stored `API_SERVER_KEY` in its own SecretStore while Hermes Gateway loaded credentials from `~/.hermes/.env` with `override=True`. `/health` remained 200 (public) while `/v1/models` returned invalid API key.

## Decision

1. Local Hermes configuration is owned by Hermes: credentials in `~/.hermes/.env`, behavior in `~/.hermes/config.yaml`.
2. `HermesLocalConfigService` is the only Runtime entry point for reading local Hermes config.
3. Runtime does not maintain a competing Gateway credential SOT for local Hermes.
4. External/development Hermes (`managed=false`) never auto-generates `API_SERVER_KEY`; missing key fails closed with `HERMES_API_SERVER_KEY_MISSING`.
5. Legacy Runtime SecretStore `API_SERVER_KEY` may remain on disk for diagnostics but is never used for local Gateway auth.

## Consequences

- Gateway Process env and HTTP clients resolve the same dotenv key.
- Managed-install key generation (if needed later) must write atomically to Hermes `.env`.
