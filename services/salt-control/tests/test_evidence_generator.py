from __future__ import annotations

from services.evidence_service import generate_bundle


def test_evidence_generator_never_auto_proven(tmp_path):
    result = generate_bundle(
        root=tmp_path,
        rollout_id="ro_test",
        git_commit="abc",
        snapshot_digest="deadbeef",
        release_id="rel",
        config_revision="cfg",
        files={
            "baseline": {"status": "proven"},  # must be downgraded without signer
            "final-go-no-go": {"decision": "NO-GO", "status": "not_proven"},
        },
    )
    assert result["status"] == "not_proven"
    manifest = (tmp_path / "docs/salt/evidence/v2.4.1/ring0/ro_test").glob("*/manifest.json")
    assert list(manifest)
