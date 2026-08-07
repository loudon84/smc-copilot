---
name: gateway-supervisor-implementation
description: Use when implementing or modifying multi-profile Hermes Gateway process lifecycle, port allocation, health checks, crash recovery, logs, or profile start/stop/restart behavior.
license: Proprietary
compatibility: Designed for Cursor Agent working on Python 3.12, FastAPI, asyncio subprocess, psutil, SQLite, Hermes Gateway.
metadata:
  version: "1.0"
  owner: "smc-copilot-desktop"
---

# Gateway Supervisor Implementation Skill

## Scope

Implement multi-profile Hermes Gateway lifecycle management.

Core modules:

```text
services/gateway_supervisor.py
runtime/gateway_process.py
runtime/gateway_registry.py
runtime/port_allocator.py
runtime/heartbeat.py
integrations/hermes/client.py
integrations/hermes/profile_loader.py
api/v1/profiles.py
api/v1/gateways.py
schemas/profile.py
schemas/gateway.py
db/models/profile.py
db/models/gateway.py
```

## Required state machine

```text
STOPPED
STARTING
RUNNING
ERROR
RESTARTING
STOPPING
```

Do not model runtime status as arbitrary strings.

## Implementation procedure

1. Inspect existing profile and gateway models.
2. Add or update explicit enums for profile and gateway status.
3. Implement process registry keyed by `profile_id`.
4. Implement stable port allocation:
   - default profile: configured port, normally 8642
   - other profiles: allocated from configured range
   - collision check before start
5. Implement async process start:
   - create subprocess
   - redirect stdout/stderr to profile log file
   - store pid and start timestamp
6. Implement health check:
   - call gateway `/v1/models` or configured health endpoint
   - timeout quickly
   - do not block the event loop
7. Implement stop:
   - graceful terminate
   - timeout
   - kill only the target process tree if needed
8. Implement restart:
   - stop target profile only
   - start again
   - preserve other running profiles
9. Add API endpoints:
   - `POST /api/v1/profiles/{id}/start`
   - `POST /api/v1/profiles/{id}/stop`
   - `POST /api/v1/profiles/{id}/restart`
   - `GET /api/v1/profiles/{id}/status`
10. Add tests with mocked subprocess and mocked Hermes HTTP.

## Process safety rules

- Never kill processes by port alone.
- Store and validate PID ownership.
- Never use shell=True unless there is a specific reason and command policy allows it.
- Capture logs per profile.
- All spawned processes must be recoverable after service restart by reading persisted state and validating actual PID status.

## Test checklist

- start one profile
- start multiple profiles
- port collision rejected
- stop one profile without stopping others
- restart crashed profile
- health timeout marks ERROR
- service restart reconciles stale pid
- logs are profile-specific
