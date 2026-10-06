# Expert execution tests

Coverage for the retired Work Expert path keeps the continuation drop, shared SSE framing, and auth token helpers that other owners still use.

## Continuation normalize whitelist

`normalizeContinuationItems` must drop `expert-run` rows, including formerly valid v1 items, and keep ordinary Chat user/assistant items.

## SSE id line parsing

`parseRunSseBlock` optionally parses `id:` lines alongside `event:`/`data:` for Last-Event-ID resume without changing existing callers.

## Access token local expiry

Desktop-owned local JWT expiry must refresh before Expert or Remote Expert HTTP, without waiting for a 401.

## Access token refresh failure

Refresh failure must map to an explicit unauthorized/auth-required error instead of retrying forever.
