---
lat:
  require-code-mention: true
---

# Expert execution tests

Unit and component coverage for Gateway client, run lifecycle, IPC validation, continuation, SSE framing, and minimum-stage UI.

## Gateway catalog cache

Catalog list responses are cached for the configured TTL; a second call within TTL must not refetch, and expiry triggers a fresh fetch.

## Skill exact call

`tools/call` reads `structuredContent` for task acceptance, sends `Authorization` and `X-Idempotency-Key`, and maps accepted fields (`task_id`, event/result URLs).

## JSON-RPC 200-with-error

HTTP 200 responses carrying a JSON-RPC `error` object (including `data.errorCode`) reject as `ExpertGatewayError` instead of being treated as success.

## HTTP 4xx mapping

REST error bodies with `message_key` / `error_code` map to `ExpertGatewayError` with the expected status and code.

## SSE id line parsing

`parseRunSseBlock` optionally parses `id:` lines alongside `event:`/`data:` for Last-Event-ID resume without changing existing callers.

## SSE dedup and ordering

Duplicate SSE ids are ignored; a lower `event_seq` must not overwrite a higher one already applied; terminal completion wins.

## SSE reconnect and polling fallback

After reconnect budget exhaustion, status polling at 15s can complete a run when snapshot/result become ready.

## Polling delivery timeout

When polling exceeds the 10-minute budget without terminal completion, projection reports `delivery-timeout`.

## Cancel queued vs running

Queued cancel removes locally without a remote call; running cancel invokes `cancelTask` with the HermesTask id.

## Retry clientRequestId

Retry after terminal failure requires a new `clientRequestId`; reusing the failed id rejects with `RETRY_ID_REUSED`.

## Rejects client artifact URLs

IPC/download validation rejects payloads that include client-supplied `downloadUrl` or `url` fields.

## Requires artifact identifiers

Artifact download input must include `taskId` and `artifactId` without optional URL fields.

## Cross-origin rejection

Artifact download guards surface `CROSS_ORIGIN_REJECTED` for cross-origin URL rejection via `ExpertGatewayError`.

## Continuation normalize whitelist

`normalizeContinuationItems` preserves valid `expert-run` schemaVersion 1 entries and drops invalid schema versions while keeping unrelated kinds.

## Minimum stage timeline

`ExpertTimeline` exports a component tied to non-terminal phases and minimum display stages — no fabricated tool progress.
