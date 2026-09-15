# Work Facts Authority Contract

Production Work Router input must be a content-bound `smc.ges.work-facts.v1` envelope.

This is derived routing working-memory, not a second Roadmap/PRD/Plan SOT.

## Envelope

```json
{
  "schema": "smc.ges.work-facts.v1",
  "work_item_id": "RM-001",
  "facts": {},
  "provenance": {
    "governed": {
      "source_kind": "ROADMAP",
      "source_ref": "roadmap#RM-001",
      "source_sha256": "sha256:...",
      "authority": "AUTHORITATIVE"
    }
  },
  "facts_digest": "sha256:..."
}
```

## Allowed source kinds

`ROADMAP` | `FEATURE` | `PRD` | `PLAN` | `ORCHESTRATOR_REQUEST` | `DERIVED`

Forbidden alone for `governed=false`: `WORKER_ASSERTION` | `MODEL_GUESS` | `PROMPT_TEXT_ONLY`

## Production entry

```text
Production entry:

```text
route_bound(repo, envelope, previous_profile=None, caller_facts=None)
```

`using-superpowers` is a deprecated shim; canonical owner is `smc-work-router`.
CLI: --work-facts <file>
```

`--unsafe-raw-facts` is development/selftest only.

Legacy `smc.ges.work-authority.v1` is a one-release read-only compat shim.
