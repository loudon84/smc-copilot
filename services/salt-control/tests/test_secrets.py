from __future__ import annotations

from datetime import UTC, datetime

import pytest

from core.logging import safe_log_fields
from db.repositories.interfaces import BindingRecord


@pytest.mark.asyncio
async def test_secrets_allow(client, seed_token, secret_provider, repos):
    await seed_token("tok-sec")
    enrolled = client.post(
        "/salt/v1/enrollments",
        json={
            "enrollmentToken": "tok-sec",
            "requestId": "req-sec",
            "device": {
                "hostname": "PC-SEC",
                "machineGuidHash": "guid-sec",
                "windowsBuild": 26100,
                "arch": "AMD64",
            },
        },
    ).json()
    eid = enrolled["endpointId"]
    await repos.bindings.upsert(
        BindingRecord(
            endpoint_id=eid,
            user_id="u_sec",
            windows_account=r"DOMAIN\sec",
            windows_sid="S-1-5-21-9",
            profile_dir=r"C:\Users\sec",
            active=True,
            revision="b1",
            bound_at=datetime.now(UTC),
        )
    )
    secret_provider.put(
        "smc://providers/dashscope",
        "super-secret-value",
        endpoints={eid},
        users={"u_sec"},
    )
    resp = client.post(
        "/salt/v1/secrets:resolve",
        headers={"Authorization": f"Device {enrolled['deviceCredential']}"},
        json={
            "endpointId": eid,
            "userId": "u_sec",
            "requestId": "req-sec-1",
            "refs": ["smc://providers/dashscope"],
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("cache-control") == "no-store"
    assert resp.json()["secrets"][0]["value"] == "super-secret-value"


@pytest.mark.asyncio
async def test_secrets_deny_acl(client, seed_token, secret_provider, repos):
    await seed_token("tok-sec2")
    enrolled = client.post(
        "/salt/v1/enrollments",
        json={
            "enrollmentToken": "tok-sec2",
            "requestId": "req-sec2",
            "device": {
                "hostname": "PC-SEC2",
                "machineGuidHash": "guid-sec2",
                "windowsBuild": 26100,
                "arch": "AMD64",
            },
        },
    ).json()
    eid = enrolled["endpointId"]
    await repos.bindings.upsert(
        BindingRecord(
            endpoint_id=eid,
            user_id="u_sec",
            windows_account=r"DOMAIN\sec",
            windows_sid="S-1-5-21-9",
            profile_dir=r"C:\Users\sec",
            active=True,
            revision="b1",
            bound_at=datetime.now(UTC),
        )
    )
    secret_provider.put(
        "smc://providers/dashscope",
        "super-secret-value",
        endpoints={"ep_other"},
        users={"u_other"},
    )
    resp = client.post(
        "/salt/v1/secrets:resolve",
        headers={"Authorization": f"Device {enrolled['deviceCredential']}"},
        json={
            "endpointId": eid,
            "userId": "u_sec",
            "requestId": "req-sec-deny",
            "refs": ["smc://providers/dashscope"],
        },
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "secret_forbidden"
    assert "super-secret-value" not in resp.text


def test_no_value_in_error_logs_helper():
    fields = safe_log_fields(
        endpoint_id="ep_1",
        secret="plaintext-should-hide",
        token="abc123token",
        ref="smc://providers/dashscope",
    )
    assert fields["secret"] == "[REDACTED]"
    assert fields["token"] == "[REDACTED]"
    assert fields["ref"] == "smc://providers/dashscope"
    assert "plaintext-should-hide" not in str(fields)
