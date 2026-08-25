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

File Platform remote transfer never accepts Renderer-supplied `downloadUrl` / `url`; Gateway builds same-origin paths from artifact id only.

## Async artifact discovery after completion

Task phase becomes `succeeded` with result content before `listArtifacts` resolves; discovery loading/ready/error is independent and never flips phase to failed.

## Artifact discovery metadata failure

When `listArtifacts` throws, projection keeps `succeeded` and exposes `artifactDiscovery=error` with a retry path via `retryArtifactDiscovery`.

## Cross-origin rejection

Gateway `openAuthorizedGet` / joinUrl surfaces `CROSS_ORIGIN_REJECTED` for cross-origin URL rejection via `ExpertGatewayError`.

## Continuation normalize whitelist

`normalizeContinuationItems` preserves valid `expert-run` schemaVersion 1 entries and drops invalid schema versions while keeping unrelated kinds.

## Catalog auth refresh retry

JSON-RPC `Authentication expired` / `MCP_AUTH_REQUIRED` on catalog list refreshes the User JWT once and retries the same call with the new token.

## Access token local expiry

`ensureFreshAccessToken` refreshes when `expiresAt` is within the skew window, and does not refetch while the stored expiry is still valid.

## Access token refresh failure

A failed `refresh_token` exchange clears the stored session instead of keeping a dead access token.

## Minimum stage timeline

`ExpertTimeline` exports a component tied to non-terminal phases and minimum display stages — no fabricated tool progress.

## Consumer lock version pin

`WORK_EXPERT_CONTRACT_VERSION` must match `contracts/work-expert/v1.0.2/consumer-lock.json`, and SHA256SUMS must list catalog/skill annotation schemas plus openapi.

## Silent-call allowlist

`canSilentCallExpertSkill` is true only for ready catalog, ready skill, `callEnabled === true`, `riskLevel === "low"`, and `approvalMode === "auto"`.

## Context control active gate

Inactive `ExpertContextControl` must not fetch health/catalog on mount; active instances load health and catalog.

## Context control stale skills

Delayed skills for Expert A must not overwrite Expert B after a fast A→B selection change.

## Terminal transcript materialize

Once `task_id` exists, Expert runs materialize into Hermes `state.db` as user + assistant messages (idempotent).

`task.progress` updates the assistant row live; terminal copy prefers result then summary. Duplicate prompt titles are disambiguated to satisfy Hermes `UNIQUE(sessions.title)`.

