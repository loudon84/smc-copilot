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
