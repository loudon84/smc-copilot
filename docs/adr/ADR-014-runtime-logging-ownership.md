# ADR-014: Runtime Logging Ownership

## Status

Accepted (PRD v1.4.1 Hotfix Phase E)

## Context

Runtime logging was stderr-only, so Desktop “View Logs” / `/diagnostics/logs`
could not show durable service output after process restarts. Default `log_dir`
also pointed at the source tree instead of `RUNTIME_DATA_DIR`.

## Decision

- `configure_logging(settings)` installs dual sinks: stderr ConsoleRenderer and
  rotating JSON Lines file at `<RUNTIME_DATA_DIR>/logs/runtime-service.log`
  (10MB × 5, UTF-8).
- Uvicorn `uvicorn` / `uvicorn.error` / `uvicorn.access` loggers are attached.
- Configuration is idempotent within a process.
- `/diagnostics/logs` returns additive `source` identifying the file path.
- Desktop Logs UI reads diagnostics logs; Expert MCP tab is labeled Diagnostics
  until a dedicated log API exists.

## Consequences

- Operators and Desktop UI share one Runtime-owned log file.
- Override remains available via `RUNTIME_LOG_DIR`.
