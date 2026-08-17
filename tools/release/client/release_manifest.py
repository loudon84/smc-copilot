"""Build smc.client-release.v1."""

from __future__ import annotations

from typing import Any

SCHEMA = "smc.client-release.v1"


def build_client_release_manifest(
    *,
    release_version: str,
    requirements: dict[str, str],
    work: dict[str, Any],
    hermes: dict[str, Any],
    opsi: dict[str, Any],
    opsi_client_agent: dict[str, Any],
    build_id: str,
    live_eligible: bool,
) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "releaseVersion": release_version,
        "platform": "windows",
        "architecture": "amd64",
        "requirements": requirements,
        "work": {
            "version": work["version"],
            "sha256": work["sha256"],
            "setupSha256": work.get("setupSha256", work["sha256"]),
            "portableSha256": work.get("portableSha256", work["sha256"]),
        },
        "hermes": {
            "version": hermes["version"],
            "profile": hermes["profile"],
            "sourceRevision": hermes["sourceRevision"],
            "artifactSha256": hermes["artifactSha256"],
            "manifestSha256": hermes["manifestSha256"],
        },
        "opsi": {
            "productVersion": opsi["productVersion"],
            "packageVersion": opsi["packageVersion"],
            "controllerRevision": opsi["controllerRevision"],
            "artifactSha256": opsi["artifactSha256"],
        },
        "opsiClientAgent": {
            "sha256": opsi_client_agent["sha256"],
            "version": opsi_client_agent.get("version", ""),
            "authenticodeStatus": opsi_client_agent.get("authenticodeStatus", ""),
        },
        "buildId": build_id,
        "liveEligible": live_eligible,
    }
