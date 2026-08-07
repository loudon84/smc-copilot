"""Workspace Guard v2 tests (PRD FR-604)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from core.errors import PolicyError
from runtime.policy.workspace_guard_v2 import WorkspaceGuardV2


# @lat: [[tests#Workspace Guard v2#Dotdot rejected]]
def test_dotdot_rejected(tmp_path: Path) -> None:
    root = tmp_path / "workspace"
    root.mkdir()
    guard = WorkspaceGuardV2()
    with pytest.raises(PolicyError, match="traversal"):
        guard.validate_path_with_policy(str(root), "../outside.txt")


# @lat: [[tests#Workspace Guard v2#UNC rejected]]
@pytest.mark.skipif(sys.platform != "win32", reason="UNC paths are Windows-specific")
def test_unc_rejected(tmp_path: Path) -> None:
    root = tmp_path / "workspace"
    root.mkdir()
    guard = WorkspaceGuardV2()
    with pytest.raises(PolicyError, match="UNC"):
        guard.validate_path_with_policy(str(root), r"\\server\share\file.txt")


# @lat: [[tests#Workspace Guard v2#Unauthorized drive rejected]]
@pytest.mark.skipif(sys.platform != "win32", reason="drive letters are Windows-specific")
def test_unauthorized_drive_rejected(tmp_path: Path) -> None:
    root = tmp_path / "workspace"
    root.mkdir()
    guard = WorkspaceGuardV2(allowed_drives={"C"})
    with pytest.raises(PolicyError, match="Drive not authorized"):
        guard.validate_path_with_policy(str(root), "D:\\other\\file.txt")
