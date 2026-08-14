# Diagnostic rules (deterministic, no LLM)

Issue codes used by `smc-hermes-agent`:

- `GATEWAY_UNREACHABLE` → L1 restart
- `CONFIG_INVALID` → rollback revision
- `USER_CONTEXT_PENDING` → wait for logon
- `VERSION_NOT_PINNED` → fail closed
- `MANUAL_ACTION_REQUIRED` → L3/L4
