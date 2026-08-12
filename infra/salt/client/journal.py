"""Durable bootstrap journal for Windows Salt client (v2.2).

States (in order):
  PREFLIGHT → ENROLLMENT_CREATED → MSI_VERIFIED → MINION_INSTALLED →
  MINION_CONFIGURED → KEY_REPORTED → KEY_ACCEPTED → EXTENSIONS_SYNCED →
  HIGHSTATE_APPLIED → HERMES_VERIFIED → OWNER_SWITCHED → WORK_VERIFIED →
  COMPLETED | ROLLBACK

Owner switch to salt must only persist after COMPLETED (health + work probe).
Default path: %ProgramData%\\SMC\\bootstrap-journal.json
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

JournalState = Literal[
    "PREFLIGHT",
    "ENROLLMENT_CREATED",
    "MSI_VERIFIED",
    "MINION_INSTALLED",
    "MINION_CONFIGURED",
    "KEY_REPORTED",
    "KEY_ACCEPTED",
    "EXTENSIONS_SYNCED",
    "HIGHSTATE_APPLIED",
    "HERMES_VERIFIED",
    "OWNER_SWITCHED",
    "WORK_VERIFIED",
    "COMPLETED",
    "ROLLBACK",
]

ORDERED: tuple[JournalState, ...] = (
    "PREFLIGHT",
    "ENROLLMENT_CREATED",
    "MSI_VERIFIED",
    "MINION_INSTALLED",
    "MINION_CONFIGURED",
    "KEY_REPORTED",
    "KEY_ACCEPTED",
    "EXTENSIONS_SYNCED",
    "HIGHSTATE_APPLIED",
    "HERMES_VERIFIED",
    "OWNER_SWITCHED",
    "WORK_VERIFIED",
    "COMPLETED",
)


def default_journal_path(program_data: str | Path | None = None) -> Path:
    root = Path(program_data or os.environ.get("ProgramData") or "/var/lib/smc")
    return root / "SMC" / "bootstrap-journal.json"


@dataclass
class BootstrapJournal:
    path: Path
    state: JournalState = "PREFLIGHT"
    endpoint_id: str | None = None
    enrollment_id: str | None = None
    history: list[dict[str, Any]] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path | None = None) -> BootstrapJournal:
        target = path or default_journal_path()
        if not target.is_file():
            return cls(path=target)
        payload = json.loads(target.read_text(encoding="utf-8"))
        return cls(
            path=target,
            state=payload.get("state", "PREFLIGHT"),  # type: ignore[arg-type]
            endpoint_id=payload.get("endpointId"),
            enrollment_id=payload.get("enrollmentId"),
            history=list(payload.get("history") or []),
            extra=dict(payload.get("extra") or {}),
        )

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "state": self.state,
            "endpointId": self.endpoint_id,
            "enrollmentId": self.enrollment_id,
            "history": self.history,
            "extra": self.extra,
            "updatedAt": datetime.now(UTC).isoformat(),
        }
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, self.path)

    def advance(self, state: JournalState, **extra: Any) -> None:
        self.state = state
        entry = {"state": state, "at": datetime.now(UTC).isoformat(), **extra}
        self.history.append(entry)
        if "endpoint_id" in extra:
            self.endpoint_id = str(extra["endpoint_id"])
        if "enrollment_id" in extra:
            self.enrollment_id = str(extra["enrollment_id"])
        self.extra.update({k: v for k, v in extra.items() if k not in {"endpoint_id", "enrollment_id"}})
        self.save()

    def mark_rollback(self, reason: str) -> None:
        self.advance("ROLLBACK", reason=reason)

    def is_complete(self) -> bool:
        return self.state == "COMPLETED"

    def can_write_salt_owner(self) -> bool:
        """Control-owner may switch to salt only after COMPLETED."""
        return self.state == "COMPLETED"

    def resume_from(self) -> JournalState:
        """Return current state so bootstrap can continue after reboot."""
        return self.state

    def next_pending(self) -> JournalState | None:
        if self.state in {"COMPLETED", "ROLLBACK"}:
            return None
        try:
            idx = ORDERED.index(self.state)  # type: ignore[arg-type]
        except ValueError:
            return "PREFLIGHT"
        if idx + 1 >= len(ORDERED):
            return None
        return ORDERED[idx + 1]
