# Expert execution

Work no longer runs the HermesTask Explicit Expert production path. Remote Expert is owned by [[remote-expert]]. Historical `contracts/work-expert/v1.0.2/` remains frozen and unread at runtime.

## Shared DTO owner

The former Expert DTO owner is removed. Historical Expert continuation rows of kind `expert-run` are dropped by [[src/main/session-continuation-store.ts]] and must not resume.

## Gateway client

The NoDeskClaw Expert HTTP client is removed. Remote Expert catalog and ACP traffic uses public Backend APIs only.

## Run service and SSE framing

HermesTask Expert lifecycle is removed. New Remote Expert turns use ACP `session/prompt` over WSS.

## IPC and preload bridge

`expert.start` and the Expert preload surface are removed. Chat without a Remote Expert selection stays on Local Hermes.

## Continuation and artifacts

Historical Expert transcripts remain readable as `chat/hermes-chat` rows. Remote Expert artifacts use File Platform provider `remote-expert-acp`. Historical `provider="expert"` remote reads return `FILE_REMOTE_UNAVAILABLE`.

See [[expert-execution-tests]] for leftover continuation-drop coverage.
