from __future__ import annotations

from app.modules.documents.exceptions import VersionConflict


def test_version_conflict_fields() -> None:
    e = VersionConflict(current_version_no=4, base_version_no=3)
    assert e.code == "version_conflict"
    assert e.current_version_no == 4
    assert e.base_version_no == 3
