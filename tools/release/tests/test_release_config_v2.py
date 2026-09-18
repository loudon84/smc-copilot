"""Unit tests for smc.client-release.config.v2 loader."""

from __future__ import annotations

from pathlib import Path

import pytest

from tools.release.client.release_config import (
    SCHEMA,
    canonical_repository_key,
    load_release_config,
    repository_identity,
)
from tools.release.client.hermes_native_manifest import build_hermes_native_manifest

ROOT = Path(__file__).resolve().parents[3]
GOLDEN = ROOT / "release" / "client-release.yaml"


def _write(path: Path, text: str) -> Path:
    path.write_text(text, encoding="utf-8")
    return path


def _base_yaml(**overrides: str) -> str:
    lines = [
        f"schema: {SCHEMA}",
        "release:",
        '  version: "1.7.2"',
        "  channel: lab",
        "work:",
        "  enabled: true",
        "hermes:",
        "  distribution: enterprise-native",
        "  source:",
        "    installUrl: http://git.superic.com/aiplatform/hermes-agent.git",
        "    repositoryHttp: http://git.superic.com/aiplatform/hermes-agent.git",
        "    allowedHosts:",
        "      - git.superic.com",
        "    defaultBranch: main",
        '    approvedCommit: "29112bef099274229cadff79cdff7bf7b99c4b77"',
        "    publicUpstreamAllowedOnEndpoint: false",
        "  update:",
        "    policy: follow-defaultBranch",
        "  compatibility:",
        '    minVersion: "0.21.0"',
        '    testedVersion: "0.21.0"',
        "  gateway:",
        '    host: "127.0.0.1"',
        "    port: 8642",
        "  policy:",
        '    version: "smc-managed-2"',
        "  bootstrap:",
        "    authMode: anonymous-internal",
        "",
    ]
    text = "\n".join(lines)
    for old, new in overrides.items():
        text = text.replace(old, new)
    return text


def test_golden_http_only_loads():
    data = load_release_config(GOLDEN)
    assert data["schema"] == SCHEMA
    assert data["hermes"]["distribution"] == "enterprise-native"
    assert data["hermes"]["source"]["installUrl"].startswith("http://git.superic.com/")
    assert "repositoryHttps" not in data["hermes"]["source"]
    assert "repositorySsh" not in data["hermes"]["source"]
    assert data["hermes"]["source"]["identity"].startswith("sha256:")
    key = canonical_repository_key(data["hermes"]["source"]["installUrl"])
    assert key == "git|git.superic.com|aiplatform/hermes-agent"
    assert data["hermes"]["source"]["identity"] == repository_identity(
        data["hermes"]["source"]["installUrl"]
    )


def test_missing_install_url_fails(tmp_path: Path):
    text = _base_yaml().replace(
        "    installUrl: http://git.superic.com/aiplatform/hermes-agent.git\n",
        "",
    )
    path = _write(tmp_path / "missing-install.yaml", text)
    with pytest.raises(ValueError, match="RELEASE_CONFIG_INVALID.*installUrl"):
        load_release_config(path)


def test_missing_all_repository_urls_fails(tmp_path: Path):
    text = _base_yaml().replace(
        "    repositoryHttp: http://git.superic.com/aiplatform/hermes-agent.git\n",
        "",
    )
    path = _write(tmp_path / "missing-repos.yaml", text)
    with pytest.raises(
        ValueError,
        match="RELEASE_CONFIG_INVALID.*repositoryHttp\\|repositoryHttps\\|repositorySsh",
    ):
        load_release_config(path)


def test_v1_schema_rejected(tmp_path: Path):
    path = _write(
        tmp_path / "v1.yaml",
        "\n".join(
            [
                "schema: smc.client-release.config.v1",
                "release:",
                '  version: "1.7.2"',
                '  channel: "lab"',
                "work:",
                "  enabled: true",
                "hermes:",
                '  repo: "D:/git/hermes-agent"',
                "",
            ]
        ),
    )
    with pytest.raises(ValueError, match="RELEASE_CONFIG_INVALID.*no longer accepted"):
        load_release_config(path)


def test_https_only_ok_when_install_url_matches(tmp_path: Path):
    text = _base_yaml(
        **{
            "    installUrl: http://git.superic.com/aiplatform/hermes-agent.git": (
                "    installUrl: https://git.superic.com/aiplatform/hermes-agent.git"
            ),
            "    repositoryHttp: http://git.superic.com/aiplatform/hermes-agent.git": (
                "    repositoryHttps: https://git.superic.com/aiplatform/hermes-agent.git"
            ),
        }
    )
    path = _write(tmp_path / "https-only.yaml", text)
    data = load_release_config(path)
    assert data["hermes"]["source"]["installUrl"].startswith("https://")
    assert data["hermes"]["source"]["identity"].startswith("sha256:")


def test_hermes_native_manifest_from_golden():
    config = load_release_config(GOLDEN)
    manifest = build_hermes_native_manifest(config, b"fake-install.ps1-bytes")
    assert manifest["schemaVersion"] == 1
    assert manifest["distribution"] == "enterprise-native"
    assert manifest["repositoryIdentity"] == config["hermes"]["source"]["identity"]
    assert manifest["approvedCommit"] == config["hermes"]["source"]["approvedCommit"]
    assert len(manifest["installerSha256"]) == 64
    assert manifest["policyVersion"] == "smc-managed-2"
    assert manifest["compatibility"]["minVersion"] == "0.21.0"
