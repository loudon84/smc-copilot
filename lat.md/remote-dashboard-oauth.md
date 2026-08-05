---
lat:
  require-code-mention: true
---

# Remote Dashboard OAuth

OAuth transport rules for remote dashboard chat: failures must not silently fall back to insecure or unauthenticated paths.

## Test specifications

Automated coverage for OAuth transport guarantees in dashboard chat hooks.

### OAuth no-fallback

When OAuth/token acquisition fails, the transport must error visibly and must not fall back to an unauthenticated or alternate insecure chat endpoint.
