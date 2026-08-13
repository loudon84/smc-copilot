from __future__ import annotations

import pytest
from conftest import master_token

from integrations.management_backend import BackendDesiredState, BackendUserBinding


@pytest.mark.asyncio
async def test_desired_state_binding_user(client, seed_token, backend, settings):
    await seed_token("tok-ds")
    enrolled = client.post(
        "/salt/v1/enrollments",
        json={
            "enrollmentToken": "tok-ds",
            "requestId": "req-ds",
            "device": {
                "hostname": "PC-DS",
                "machineGuidHash": "guid-ds",
                "windowsBuild": 26100,
                "arch": "AMD64",
            },
        },
    ).json()
    eid = enrolled["endpointId"]
    backend.put_binding(
        BackendUserBinding(
            endpoint_id=eid,
            user_id="u_bound",
            windows_account=r"DOMAIN\alice",
            windows_sid="S-1-5-21-1",
            profile_dir=r"C:\Users\alice",
            revision="bind_1",
        )
    )
    backend.put_desired(
        BackendDesiredState(
            endpoint_id=eid,
            revision="rev_1",
            user_id="u_bound",
            hermes_home=r"C:\Users\alice\AppData\Local\hermes",
            hermes_version="0.20.0",
            artifact_ref="hermes/windows/AMD64/0.20.0",
            ring="ring0",
            desired_owner="salt",
            secrets=[{"name": "DASHSCOPE_API_KEY", "ref": "smc://providers/dashscope"}],
        )
    )

    resp = client.get(
        f"/salt/v1/endpoints/{eid}/desired-state",
        headers={"Authorization": f"Bearer {master_token(settings)}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["userId"] == "u_bound"
    assert body["user"]["windowsAccount"] == r"DOMAIN\alice"
    assert body["notModified"] is False
    assert body["schema"] == "smc.desired-state.v2"


@pytest.mark.asyncio
async def test_desired_state_not_modified(client, seed_token, backend, settings):
    await seed_token("tok-ds2")
    enrolled = client.post(
        "/salt/v1/enrollments",
        json={
            "enrollmentToken": "tok-ds2",
            "requestId": "req-ds2",
            "device": {
                "hostname": "PC-DS2",
                "machineGuidHash": "guid-ds2",
                "windowsBuild": 26100,
                "arch": "AMD64",
            },
        },
    ).json()
    eid = enrolled["endpointId"]
    backend.put_binding(
        BackendUserBinding(
            endpoint_id=eid,
            user_id="u_bound",
            windows_account=r"DOMAIN\bob",
            windows_sid="S-1-5-21-2",
            profile_dir=r"C:\Users\bob",
            revision="bind_1",
        )
    )
    backend.put_desired(
        BackendDesiredState(
            endpoint_id=eid,
            revision="rev_keep",
            user_id="u_bound",
            hermes_home=r"C:\Users\bob\AppData\Local\hermes",
            hermes_version="0.20.0",
            artifact_ref="hermes/windows/AMD64/0.20.0",
            ring="ring0",
            desired_owner="salt",
        )
    )
    resp = client.get(
        f"/salt/v1/endpoints/{eid}/desired-state",
        params={"knownRevision": "rev_keep"},
        headers={"Authorization": f"Bearer {master_token(settings)}"},
    )
    assert resp.status_code == 200
    assert resp.json()["notModified"] is True


@pytest.mark.asyncio
async def test_desired_state_unavailable(client, seed_token, backend, settings):
    await seed_token("tok-ds3")
    enrolled = client.post(
        "/salt/v1/enrollments",
        json={
            "enrollmentToken": "tok-ds3",
            "requestId": "req-ds3",
            "device": {
                "hostname": "PC-DS3",
                "machineGuidHash": "guid-ds3",
                "windowsBuild": 26100,
                "arch": "AMD64",
            },
        },
    ).json()
    backend.set_available(False)
    resp = client.get(
        f"/salt/v1/endpoints/{enrolled['endpointId']}/desired-state",
        headers={"Authorization": f"Bearer {master_token(settings)}"},
    )
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "desired_state_unavailable"


@pytest.mark.asyncio
async def test_system_and_incomplete_binding_fail_closed(client, seed_token, backend, settings):
    await seed_token("tok-sys")
    enrolled = client.post(
        "/salt/v1/enrollments",
        json={
            "enrollmentToken": "tok-sys",
            "requestId": "req-sys",
            "device": {
                "hostname": "PC-SYS",
                "machineGuidHash": "guid-sys",
                "windowsBuild": 26100,
                "arch": "AMD64",
            },
        },
    ).json()
    eid = enrolled["endpointId"]
    backend.put_binding(
        BackendUserBinding(
            endpoint_id=eid,
            user_id="u_sys",
            windows_account="SYSTEM",
            windows_sid="S-1-5-18",
            profile_dir=r"C:\Windows\System32\config\systemprofile",
            revision="bind_sys",
        )
    )
    backend.put_desired(
        BackendDesiredState(
            endpoint_id=eid,
            revision="rev_sys",
            user_id="u_sys",
            hermes_home=r"C:\h",
            hermes_version="0.20.0",
            artifact_ref="hermes/0.20.0",
            ring="ring0",
            desired_owner="salt",
        )
    )
    resp = client.get(
        f"/salt/v1/endpoints/{eid}/desired-state",
        headers={"Authorization": f"Bearer {master_token(settings)}"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "validation_error"

    backend.put_binding(
        BackendUserBinding(
            endpoint_id=eid,
            user_id="u_empty",
            windows_account=r"DOMAIN\alice",
            windows_sid="",
            profile_dir=r"C:\Users\alice",
            revision="bind_empty",
        )
    )
    resp = client.get(
        f"/salt/v1/endpoints/{eid}/desired-state",
        headers={"Authorization": f"Bearer {master_token(settings)}"},
    )
    assert resp.status_code == 400
