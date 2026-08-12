"""Salt __utils__ name: smc_redact.mapping"""

from __future__ import annotations

from .redact import redact_mapping, redact_value

mapping = redact_mapping

__all__ = ["mapping", "redact_mapping", "redact_value"]
