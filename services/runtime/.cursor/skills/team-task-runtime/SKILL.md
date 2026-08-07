---
name: team-task-runtime
description: Use when implementing team task listening, polling, claiming, local task persistence, profile binding, run execution, status sync, retries, or ai-os-full Team Task Hub integration.
license: Proprietary
compatibility: Designed for Cursor Agent, Python 3.12, FastAPI, httpx, SQLite, Hermes Gateway, ai-os-full Team Task Hub.
metadata:
  version: "1.0"
  owner: "smc-copilot-desktop"
---

# Team Task Runtime Skill

## Scope

Implement local task intake and execution for team collaboration.

Core modules:

```text
services/task_listener.py
services/task_runtime.py
integrations/team_hub/client.py
integrations/team_hub/dto.py
integrations/team_hub/sync.py
workers/task_listener_worker.py
api/v1/tasks.py
schemas/task.py
db/models/task.py
db/repositories/task_repo.py
```

## First-stage architecture

Use polling first. Do not introduce Redis Stream, RabbitMQ, Kafka, or WebSocket unless explicitly requested.

```text
poll Team Task Hub
  -> claim assignment
  -> create local task
  -> bind target profile
  -> wait approval if required
  -> execute through HermesGatewayClient
  -> collect events
  -> sync result back to Team Task Hub
```

## Required task states

```text
REMOTE_ASSIGNED
LOCAL_CREATED
WAITING_APPROVAL
APPROVED
RUNNING
NEED_HUMAN_INPUT
COMPLETED
FAILED
CANCELLED
SYNCED
```

## Idempotency rules

Use these keys:

```text
remote_task_id
assignment_id
local_attempt_id
```

Rules:

1. Never create duplicate local tasks for the same assignment.
2. Claim before execution.
3. Persist every state transition.
4. Failed remote sync must be retryable.
5. Local execution result must be available even if remote sync fails.

## Implementation procedure

1. Define DTOs for remote task assignment.
2. Define local `Task` DB model.
3. Implement `TeamHubClient` with timeout, retry, and structured errors.
4. Implement polling worker with cancellation support.
5. Implement `TaskRuntime.create_or_update_from_assignment`.
6. Implement profile binding logic.
7. Implement execution through `HermesGatewayClient.create_run`.
8. Stream and persist run events where required.
9. Implement result sync.
10. Add tests for polling, idempotency, claim, execution, and sync retry.

## Risk checks

Before executing a remote task:

- Confirm target workspace is allowed.
- Confirm target profile is enabled.
- Confirm task payload is valid.
- Confirm action does not require pending approval.
- Record audit log.

## Output requirement for implementation tasks

When completing a Team Task Runtime change, report:

- new endpoints
- new DB fields
- sync behavior
- retry behavior
- failure modes
- tests added
