---
name: workspace-guard-approval
description: Use when implementing workspace path policies, command allowlist/denylist, approval gates, risky action interception, audit logs, or local execution safety for smc-copilot-serve.
license: Proprietary
compatibility: Designed for Cursor Agent, Python 3.12, FastAPI, SQLite, local shell adapters, Windows-compatible path validation.
metadata:
  version: "1.0"
  owner: "smc-copilot-desktop"
---

# Workspace Guard and Approval Skill

## Scope

Protect local workspaces from unsafe Agent execution.

Core modules:

```text
services/workspace_guard.py
services/approval_service.py
services/audit_service.py
integrations/local_shell/command_runner.py
integrations/local_shell/command_policy.py
api/v1/workspace.py
api/v1/approvals.py
api/v1/audit.py
schemas/workspace.py
schemas/approval.py
schemas/audit.py
db/models/workspace.py
db/models/approval.py
db/models/audit_log.py
```

## Mandatory guard points

Approval / guard checks must run before:

- shell command execution
- file write
- file delete
- Hermes profile config mutation
- Git commit / push / reset / clean
- Docker compose operations
- remote attachment download
- access to non-whitelisted workspace paths

## Path validation rules

1. Normalize paths before checking.
2. Resolve symlinks where supported.
3. Reject path traversal.
4. Treat Windows drive letters and case-insensitive paths carefully.
5. Deny secret files by default:
   - `.env`
   - `.env.local`
   - `secrets/`
   - `.git/config`
   - private keys
6. Allow only configured workspace roots.

## Command policy

Command policy categories:

```text
ALLOW
REQUIRE_APPROVAL
DENY
```

Default policy:

- Safe read-only commands may be allowed.
- Git write operations require approval.
- Docker operations require approval.
- destructive filesystem operations are denied unless explicitly approved by product design.

## Approval flow

```text
request action
  -> evaluate workspace policy
  -> evaluate command policy
  -> create approval if required
  -> wait for decision
  -> execute only if approved
  -> audit result
```

Approval states:

```text
PENDING
APPROVED
REJECTED
EXPIRED
```

## Audit requirements

Every guarded action must record:

- actor
- task_id if available
- action_type
- action_payload redacted
- decision
- timestamp
- result
- error code if failed

## Implementation procedure

1. Implement pure policy functions first.
2. Add unit tests for policy functions before wiring them into services.
3. Add ApprovalService state transitions.
4. Add API endpoints for list, approve, reject.
5. Wire guard checks into command runner and workspace mutations.
6. Add audit logs.
7. Add tests for denied actions, approval-required actions, and allowed actions.

## Test checklist

- allowed path passes
- path traversal rejected
- `.env` rejected
- command allowlist passes
- denied command rejected
- approval-required command creates approval
- approved action executes
- rejected action does not execute
- audit log created for every decision
