from __future__ import annotations

from workers.result_reconciler import parse_result_marker


def test_parse_result_marker_ignores_stale_request():
    log = (
        "SMC_ACTION_RESULT request_id=req_oldreq01 client_id=client-a.example "
        "sha256=" + ("ab" * 32) + " status=FAILED bytes=10 redacted=true\n"
        "SMC_ACTION_RESULT request_id=req_newreq01 client_id=client-a.example "
        "sha256=" + ("cd" * 32) + " status=SUCCEEDED bytes=12 redacted=true\n"
    )
    marker = parse_result_marker(log, "req_newreq01", "client-a.example")
    assert marker is not None
    assert marker["status"] == "SUCCEEDED"
    assert parse_result_marker(log, "req_missing1", "client-a.example") is None


def test_parse_result_marker_reads_continuation_parent():
    sha = "ee" * 32
    log = (
        "SMC_ACTION_RESULT request_id=req_poll_parent1 client_id=client-a.example "
        f"sha256={sha} status=SUCCEEDED bytes=12 redacted=true "
        "parent_request_id=req_parent0001 result_kind=continuation "
        f"content_sha256={sha}\n"
    )
    marker = parse_result_marker(log, "req_poll_parent1", "client-a.example")
    assert marker is not None
    assert marker["parent_request_id"] == "req_parent0001"
    assert marker["result_kind"] == "continuation"
    assert marker["content_sha256"] == sha
