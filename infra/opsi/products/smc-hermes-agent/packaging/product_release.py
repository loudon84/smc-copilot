"""Signed smc.opsi.product-release.v1 index."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

RELEASE_SCHEMA = "smc.opsi.product-release.v1"
RELEASE_KEY_ID = "smc-opsi-release-ed25519-v1"
SMOKE_KEY_ID = "TEST-ONLY-ed25519"


def _payload(index: dict[str, Any]) -> dict[str, Any]:
    return {
        "buildId": index["buildId"],
        "controller": index["controller"],
        "createdAt": index["createdAt"],
        "packageVersion": index["packageVersion"],
        "productId": index["productId"],
        "productVersion": index["productVersion"],
        "runtimes": index["runtimes"],
        "schema": index["schema"],
        "signerKeyId": index["signerKeyId"],
        "sourceRevision": index["sourceRevision"],
        "verifier": index["verifier"],
    }


def canonical_bytes(index: dict[str, Any]) -> bytes:
    return json.dumps(_payload(index), separators=(",", ":"), sort_keys=True).encode("utf-8")


def compute_digest(index: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_bytes(index)).hexdigest()


def build_unsigned(
    *,
    product_version: str,
    package_version: str,
    controller: dict[str, str],
    runtimes: list[dict[str, str]],
    verifier: dict[str, str],
    source_revision: str,
    build_id: str,
    key_id: str,
    live_eligible: bool = False,
) -> dict[str, Any]:
    if product_version.lower() == "latest":
        raise ValueError("latest is forbidden")
    body = {
        "schema": RELEASE_SCHEMA,
        "productId": "smc-hermes-agent",
        "productVersion": product_version,
        "packageVersion": package_version,
        "controller": controller,
        "runtimes": runtimes,
        "verifier": verifier,
        "sourceRevision": source_revision,
        "buildId": build_id,
        "createdAt": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "signerKeyId": key_id,
        "canonicalDigest": "",
        "signature": "",
        "liveEligible": live_eligible,
    }
    body["canonicalDigest"] = compute_digest(body)
    return body


def sign_index(index: dict[str, Any], private_key) -> dict[str, Any]:
    signature = private_key.sign(canonical_bytes(index)).hex()
    return {**index, "signature": signature}


def verify_index(index: dict[str, Any], public_key) -> None:
    if index.get("schema") != RELEASE_SCHEMA:
        raise ValueError("unexpected release schema")
    if not index.get("signature"):
        raise ValueError("release signature required")
    if compute_digest(index) != str(index.get("canonicalDigest") or ""):
        raise ValueError("release canonicalDigest mismatch")
    if not index.get("runtimes"):
        raise ValueError("release runtimes required")
    public_key.verify(bytes.fromhex(str(index["signature"])), canonical_bytes(index))


def runtime_in_catalog(index: dict[str, Any], hermes_version: str) -> bool:
    return any(str(item.get("version")) == hermes_version for item in index.get("runtimes") or [])
