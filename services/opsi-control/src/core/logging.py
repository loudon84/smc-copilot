from __future__ import annotations

import logging
import re

_SECRET_KEYS = re.compile(r"(password|secret|token|authorization|api[_-]?key|credential)", re.I)


def safe_log_fields(data: dict) -> dict:
    """Drop sensitive keys entirely — do not mask-and-keep."""
    return {key: value for key, value in data.items() if not _SECRET_KEYS.search(str(key))}


def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
