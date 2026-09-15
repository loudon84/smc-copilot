# Harness Telemetry Contract

GES Core does not hard-code a model provider. Consumer Harness adapters emit events via:

```text
runtime_metrics dispatch
runtime_metrics result
runtime_metrics cache-hit
runtime_metrics cache-miss
runtime_metrics reviewer-seat
runtime_metrics ingest --event-json <file>
runtime_metrics summarize
```

## Completeness

`complete=true` requires every governed dispatch has exactly one terminal result, requested/actual tier present (or explicit fallback), provider/model present (or `model_identity_unavailable`), outcome present, and token accounting present or `TOKEN_ACCOUNTING_UNAVAILABLE`.

Cache-hit / reviewer-seat events alone never make telemetry complete.

## Privacy

Never record prompt body, source body, secrets, API keys, passwords, token values, or customer payloads.
