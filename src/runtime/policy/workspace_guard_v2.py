"""Workspace Guard v2 — path traversal, symlink, junction, UNC, drive, temp bypass (PRD FR-604)."""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

from core.errors import PolicyError
from services.workspace_guard import WorkspaceGuard

_UNC_RE = re.compile(r"^\\\\[^\\]+\\[^\\]+")
_TEMP_NAMES = frozenset({"temp", "tmp", "appdata\\local\\temp", "appdata/local/temp"})


# @lat: [[approval-workspace#Workspace Guard v2]]
class WorkspaceGuardV2(WorkspaceGuard):
    """Extended guard rejecting UNC, unauthorized drives, symlink/junction escape, and case tricks."""

    def __init__(
        self,
        *,
        allowed_drives: set[str] | None = None,
        block_temp_bypass: bool = True,
    ) -> None:
        super().__init__()
        self._allowed_drives = allowed_drives
        self._block_temp_bypass = block_temp_bypass

    def _normalize_for_compare(self, path: Path) -> str:
        return os.path.normcase(str(path.resolve()))

    def _check_unc(self, resolved: Path) -> None:
        if _UNC_RE.match(str(resolved)):
            raise PolicyError("UNC paths are not allowed")

    def _check_drive(self, resolved: Path) -> None:
        if self._allowed_drives is None:
            return
        drive = resolved.drive.upper().rstrip(":")
        if drive and drive not in {d.upper() for d in self._allowed_drives}:
            raise PolicyError(f"Drive not authorized: {drive}")

    def _check_temp_bypass(self, resolved: Path) -> None:
        if not self._block_temp_bypass:
            return
        lower = self._normalize_for_compare(resolved)
        for temp in _TEMP_NAMES:
            if temp in lower.replace("/", "\\"):
                raise PolicyError("Temporary directory bypass not allowed")

    def _check_symlink_escape(self, workspace_root: Path, resolved: Path) -> None:
        if sys.platform == "win32":
            try:
                # Junction/symlink: resolved may differ from strict path join
                if resolved.is_symlink():
                    raise PolicyError("Symlink escape not allowed")
            except OSError:
                pass
        else:
            if resolved.is_symlink():
                raise PolicyError("Symlink escape not allowed")
        # Walk parents to detect junction hops
        current = resolved
        while True:
            if current.is_symlink():
                raise PolicyError("Symlink/junction escape not allowed")
            if current == workspace_root or current.parent == current:
                break
            current = current.parent

    def _check_dotdot(self, relative_uri: str) -> None:
        parts = Path(relative_uri).parts
        if ".." in parts:
            raise PolicyError("Path traversal (..) not allowed")

    def validate_path_with_policy(self, workspace_root: str, relative_uri: str, policy_json: str | None = None) -> None:
        self._check_dotdot(relative_uri)
        if _UNC_RE.match(relative_uri) or _UNC_RE.match(str(relative_uri)):
            raise PolicyError("UNC paths are not allowed")
        root = Path(workspace_root).resolve()
        cand = Path(relative_uri)
        if cand.is_absolute():
            if _UNC_RE.match(str(cand)):
                raise PolicyError("UNC paths are not allowed")
            resolved = cand
        else:
            resolved = (root / cand).resolve()
        self._check_unc(resolved)
        self._check_drive(resolved)
        self._check_temp_bypass(resolved)
        self._check_symlink_escape(root, resolved)
        # Case trick: resolved must match normcase relative_to root
        try:
            rel = resolved.relative_to(root)
        except ValueError as e:
            raise PolicyError("Path escapes workspace root") from e
        recomposed = (root / rel).resolve()
        if self._normalize_for_compare(recomposed) != self._normalize_for_compare(resolved):
            raise PolicyError("Case/path normalization escape not allowed")
        super().validate_path_with_policy(workspace_root, str(rel), policy_json)
