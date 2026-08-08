"""Runtime dual-channel logging — stderr console + rotating JSON file (PRD v1.4.1)."""

from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import TYPE_CHECKING

import structlog

if TYPE_CHECKING:
    from core.config import Settings

_CONFIGURED_MARKER = "smc_runtime_logging_configured"
_FILE_HANDLER_NAME = "smc_runtime_file"
_STREAM_HANDLER_NAME = "smc_runtime_stderr"


def _resolve_log_dir(settings: Settings | None) -> Path:
    if settings is not None:
        return settings.log_dir_path
    # Late import avoids circular import at module load.
    from core.config import get_settings

    return get_settings().log_dir_path


def _remove_named_handlers(logger: logging.Logger) -> None:
    remaining: list[logging.Handler] = []
    for handler in logger.handlers:
        name = getattr(handler, "name", None)
        if name in (_FILE_HANDLER_NAME, _STREAM_HANDLER_NAME):
            try:
                handler.close()
            except Exception:  # noqa: BLE001
                pass
            continue
        remaining.append(handler)
    logger.handlers = remaining


def configure_logging(settings: Settings | None = None) -> None:
    """Configure stderr ConsoleRenderer + rotating runtime-service.log (idempotent)."""
    root = logging.getLogger()
    if getattr(root, _CONFIGURED_MARKER, False):
        # Already configured in this process — do not stack handlers.
        return

    log_dir = _resolve_log_dir(settings)
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "runtime-service.log"

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        cache_logger_on_first_use=True,
    )

    console_formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.dev.ConsoleRenderer(),
        ],
    )
    file_formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.EventRenamer("event"),
            structlog.processors.JSONRenderer(),
        ],
    )

    _remove_named_handlers(root)

    stream_handler = logging.StreamHandler(sys.stderr)
    stream_handler.set_name(_STREAM_HANDLER_NAME)
    stream_handler.setFormatter(console_formatter)
    stream_handler.setLevel(logging.INFO)

    file_handler = RotatingFileHandler(
        log_path,
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.set_name(_FILE_HANDLER_NAME)
    file_handler.setFormatter(file_formatter)
    file_handler.setLevel(logging.INFO)

    root.handlers = []
    root.setLevel(logging.INFO)
    root.addHandler(stream_handler)
    root.addHandler(file_handler)

    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv_logger = logging.getLogger(name)
        uv_logger.handlers = []
        uv_logger.propagate = True
        uv_logger.setLevel(logging.INFO)

    setattr(root, _CONFIGURED_MARKER, True)


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
