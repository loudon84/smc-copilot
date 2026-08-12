from __future__ import annotations

import pytest

from client.enrollment import (
    advance,
    enrollment_complete,
    fingerprints_match,
    mock_backend_start_enrollment,
    start_enrollment,
)
from client.paths import read_endpoint_id, write_endpoint_id


def test_backend_endpoint_id_is_not_hostname() -> None:
    started = mock_backend_start_enrollment("enroll-token-1", hostname="DESKTOP-ABC")
    assert started["endpoint_id"].startswith("ep_")
    assert started["endpoint_id"] != "DESKTOP-ABC"


def test_write_endpoint_id_file(tmp_path) -> None:
    path = write_endpoint_id("ep_abc123", base=tmp_path)
    assert path.is_file()
    assert read_endpoint_id(base=tmp_path) == "ep_abc123"


def test_fingerprint_match_ignores_colons() -> None:
    assert fingerprints_match("ab:cd:ef", "abcdef") is True
    assert fingerprints_match("aaaa", "bbbb") is False


def test_enrollment_happy_path_does_not_switch_owner() -> None:
    ctx = start_enrollment(
        endpoint_id="ep_lab01",
        master="salt.example.internal",
        master_fingerprint="aa" * 32,
        enrollment_token="tok-1",
        backend_url="https://backend.example",
    )
    ctx.control_owner = "runtime"
    ctx = advance(ctx, "minion_installed")
    ctx = advance(ctx, "key_generated", fingerprint="bb" * 32)
    ctx = advance(ctx, "fingerprint_reported")
    ctx = advance(ctx, "master_pending", fingerprint="bb" * 32)
    ctx = advance(ctx, "key_accepted")
    ctx = advance(ctx, "sync_all")
    ctx = advance(ctx, "highstate")
    assert enrollment_complete(ctx) is True
    assert ctx.control_owner == "runtime"


def test_fingerprint_mismatch_fails_without_owner_change() -> None:
    ctx = start_enrollment(
        endpoint_id="ep_lab02",
        master="salt.example.internal",
        master_fingerprint="aa" * 32,
        enrollment_token="tok-2",
    )
    ctx.control_owner = "runtime"
    ctx = advance(ctx, "key_generated", fingerprint="cc" * 32)
    ctx = advance(ctx, "master_pending", fingerprint="dd" * 32)
    assert ctx.state == "failed"
    assert ctx.control_owner == "runtime"


def test_rejects_hostname_as_endpoint_id() -> None:
    with pytest.raises(ValueError, match="endpoint_id"):
        start_enrollment(
            endpoint_id="hostname",
            master="salt.example.internal",
            master_fingerprint="aa" * 32,
            enrollment_token="tok",
        )
