# v2.4.1 Evidence Schema

Each JSON file in a Ring 0 bundle MUST include:

| Field | Required | Notes |
| --- | --- | --- |
| `schema` | yes | `smc.salt-evidence.v241.<name>.v1` |
| `source` | yes | `generator` / `observer` / `salt-api` / `template` |
| `capturedAt` | yes | ISO-8601 UTC |
| `digest` | yes | SHA-256 of canonical JSON (generator fills) |
| `status` | yes | `implemented` or `not_proven` unless human `signer` present |

`manifest.json` lists SHA-256 for every file plus git commit, snapshot digest, release, config, and generator version.

`proven` is forbidden unless `signer` and `signedAt` are set by an authorized human. Generator/CI MUST rewrite `proven` → `not_proven` when signer is absent.

Missing facts MUST remain `not_proven`. Do not fill placeholders as passing.
