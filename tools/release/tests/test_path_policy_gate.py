"""Unit tests for Hermes Windows PATH immutability static gate."""

from __future__ import annotations

from pathlib import Path

import pytest

from tools.release.hermes.path_policy_gate import (
    assert_hermes_path_policy,
    assert_no_persistent_path_mutations,
    assert_path_policy_metadata,
    assert_wix_no_path_environment,
    path_policy_payload,
    scan_persistent_path_mutations,
)


def test_repo_production_source_has_no_persistent_path_mutations() -> None:
    assert_hermes_path_policy()
    assert scan_persistent_path_mutations() == []


def test_path_policy_metadata_requires_immutable() -> None:
    assert_path_policy_metadata({"environment": path_policy_payload()})
    with pytest.raises(ValueError, match="environment.path.policy"):
        assert_path_policy_metadata({})
    with pytest.raises(ValueError, match="immutable"):
        assert_path_policy_metadata({"environment": {"path": {"policy": "mutable"}}})


def test_scan_detects_setenvironmentvariable_path(tmp_path: Path) -> None:
    prod = tmp_path / "scripts"
    prod.mkdir()
    (prod / "bad.psm1").write_text(
        '[Environment]::SetEnvironmentVariable("PATH", $x, "Machine")\n',
        encoding="utf-8",
    )
    hits = scan_persistent_path_mutations(tmp_path)
    assert hits, "expected persistent PATH mutation hit"
    with pytest.raises(ValueError, match="PERSISTENT_PATH_MUTATION_FORBIDDEN"):
        assert_no_persistent_path_mutations(tmp_path)


def test_scan_allowlists_tests_directory(tmp_path: Path) -> None:
    tests = tmp_path / "tests"
    tests.mkdir()
    (tests / "fixture.ps1").write_text(
        '[Environment]::SetEnvironmentVariable("PATH", $x, "Machine")\n',
        encoding="utf-8",
    )
    assert scan_persistent_path_mutations(tmp_path) == []
    assert_no_persistent_path_mutations(tmp_path)


def test_wix_gate_rejects_environment_path(tmp_path: Path) -> None:
    (tmp_path / "Product.wxs").write_text(
        '<Wix><Environment Name="PATH" Value="C:\\bad" /></Wix>\n',
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="PERSISTENT_PATH_MUTATION_FORBIDDEN"):
        assert_wix_no_path_environment(tmp_path)


def test_wix_gate_passes_without_path_environment(tmp_path: Path) -> None:
    (tmp_path / "Product.wxs").write_text(
        '<Wix><Component Id="X"><File Id="F" Source="a" /></Component></Wix>\n',
        encoding="utf-8",
    )
    assert_wix_no_path_environment(tmp_path)
