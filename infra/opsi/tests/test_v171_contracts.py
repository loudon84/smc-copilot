from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCHEMAS = ROOT / "contracts" / "opsi"
RELEASE = ROOT / "release"
DIGEST = "aa" * 32


def _load_schema(name: str) -> dict:
    data = json.loads((SCHEMAS / name).read_text(encoding="utf-8"))
    assert data.get("additionalProperties") is False
    assert data.get("title")
    return data


def _assert_required(payload: dict, schema: dict) -> None:
    for key in schema["required"]:
        assert key in payload, f"missing required {key}"
    extra = set(payload) - set(schema["properties"])
    assert extra == set(), extra


def test_v171_schemas_exist_and_forbid_additional_properties():
    for name in (
        "runtime-profile.schema.json",
        "runtime-build.schema.json",
        "client-release.schema.json",
        "client-release-config.schema.json",
        "runtime-artifact-manifest.schema.json",
    ):
        _load_schema(name)


def test_runtime_profile_yaml_pins_smc_managed():
    text = (RELEASE / "hermes-runtime-profiles.yaml").read_text(encoding="utf-8")
    assert "smc.hermes.runtime-profile.v1" in text
    assert "smc-managed" in text
    assert "latest" not in text
    assert "@modelcontextprotocol/server-filesystem" in text
    assert "lazyInstall" in text
    assert "allowed: false" in text
    assert "127.0.0.1" in text
    assert "8642" in text


def test_client_release_yaml_uses_native_and_independent_versions():
    text = (RELEASE / "client-release.yaml").read_text(encoding="utf-8")
    assert "smc.client-release.config.v1" in text
    assert 'version: "1.7.1"' in text
    assert 'productVersion: "1.7.1"' in text
    assert "buildMode: native" in text
    assert "docker" not in text
    assert "hermes_version" not in text
    assert "profile: smc-managed" in text
    assert ">=3.12,<3.13" in text
    assert ">=22,<23" in text


def test_runtime_build_fixture_accepts_required_fields():
    schema = _load_schema("runtime-build.schema.json")
    payload = {
        "schema": "smc.hermes.runtime-build.v1",
        "version": "0.20.2",
        "platform": "windows",
        "architecture": "amd64",
        "requires": {"python": ">=3.12,<3.13", "node": ">=22,<23"},
        "source": {
            "revision": "abc1234",
            "dirty": False,
            "pyprojectSha256": DIGEST,
            "lockSha256": DIGEST,
        },
        "profile": {"name": "smc-managed", "version": 1},
        "python": {"wheelCount": 80, "wheelhouseDigest": DIGEST},
        "node": {"packageCount": 1, "packageLockDigest": DIGEST},
        "buildId": "build-1",
        "liveEligible": True,
    }
    _assert_required(payload, schema)


def test_runtime_build_fixture_rejects_missing_source():
    schema = _load_schema("runtime-build.schema.json")
    payload = {"schema": "smc.hermes.runtime-build.v1", "version": "0.20.2"}
    missing = [key for key in schema["required"] if key not in payload]
    assert "source" in missing
    assert "liveEligible" in missing


def test_client_release_fixture_accepts_required_fields():
    schema = _load_schema("client-release.schema.json")
    payload = {
        "schema": "smc.client-release.v1",
        "releaseVersion": "1.7.1",
        "platform": "windows",
        "architecture": "amd64",
        "requirements": {"python": ">=3.12,<3.13", "node": ">=22,<23"},
        "work": {"version": "0.7.4", "sha256": DIGEST},
        "hermes": {
            "version": "0.20.2",
            "profile": "smc-managed",
            "sourceRevision": "abc1234",
            "artifactSha256": DIGEST,
            "manifestSha256": DIGEST,
        },
        "opsi": {
            "productVersion": "1.7.1",
            "packageVersion": "1",
            "controllerRevision": "2",
            "artifactSha256": DIGEST,
        },
        "opsiClientAgent": {"sha256": DIGEST},
        "buildId": "build-1",
        "liveEligible": False,
    }
    _assert_required(payload, schema)


def test_client_release_rejects_unknown_property():
    schema = _load_schema("client-release.schema.json")
    extra = {"schema": "smc.client-release.v1", "unexpected": True}
    unknown = set(extra) - set(schema["properties"])
    assert "unexpected" in unknown


def test_v3_wheelhouse_fields_are_declared():
    schema = _load_schema("runtime-artifact-manifest.schema.json")
    props = schema["properties"]
    assert props["installType"]["enum"] == ["binary-zip", "python-wheelhouse"]
    assert "runtimeEntrypoint" in props
    assert "requires" in props
    assert "profile" in props
    assert "runtimeBuildSha256" in props
    assert schema["properties"]["entrypoint"]["pattern"] == '^[^\\\\/:*?"<>|]+$'
    then_required = schema["allOf"][1]["then"]["required"]
    assert "runtimeEntrypoint" in then_required
    assert "requires" in then_required
    assert "profile" in then_required
