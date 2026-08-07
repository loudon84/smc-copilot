from __future__ import annotations

from app.modules.documents.schemas import SnapshotSaveRequest


def test_snapshot_save_optional_lineage_defaults() -> None:
    req = SnapshotSaveRequest(
        base_version_no=1,
        engine_version="0.x",
        schema_version=1,
        snapshot={},
    )
    assert req.created_from is None
    assert req.related_interaction_id is None
    assert req.related_patch_id is None


def test_snapshot_save_ai_patch_apply_lineage() -> None:
    req = SnapshotSaveRequest(
        base_version_no=2,
        save_mode="manual",
        engine_version="0.x",
        schema_version=1,
        snapshot={"k": "v"},
        created_from="ai_patch_apply",
        related_interaction_id="int_abc",
        related_patch_id="patch_xyz",
    )
    assert req.created_from == "ai_patch_apply"
    assert req.related_interaction_id == "int_abc"
    assert req.related_patch_id == "patch_xyz"


def test_snapshot_save_manual_save_tag() -> None:
    req = SnapshotSaveRequest(
        base_version_no=1,
        engine_version="0.x",
        schema_version=1,
        snapshot={},
        created_from="manual_save",
    )
    assert req.created_from == "manual_save"
