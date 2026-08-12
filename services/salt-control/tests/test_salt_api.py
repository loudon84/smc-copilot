from __future__ import annotations

import pytest
from httpx import MockTransport, Response

from integrations.salt_api import ALLOWED_LOCAL_FUNCS, SaltApiMaster


@pytest.mark.asyncio
async def test_master_302_rejects_non_ep_target_and_cmd_run():
    master = SaltApiMaster(
        name="lab",
        api_url="https://salt.example:8000",
        username="u",
        password="p",
    )
    master._token = "tok"
    master._token_expires_at = 9e12

    with pytest.raises(PermissionError):
        await master.local_async("ITBJB0676", "test.ping")
    with pytest.raises(PermissionError):
        await master.local_async("ep_x", "cmd.run")
    assert "cmd.run" not in ALLOWED_LOCAL_FUNCS


@pytest.mark.asyncio
async def test_master_301_login_and_list_pending_shape():
    def handler(request):
        if request.url.path.endswith("/login"):
            return Response(
                json={"return": [{"token": "t1", "expire": 9e12}]},
                status_code=200,
            )
        request.read()
        # wheel key.list_all
        return Response(
            json={"return": [{"data": {"return": {"minions_pre": ["ep_abc"], "minions": []}}}]},
            status_code=200,
        )

    transport = MockTransport(handler)
    master = SaltApiMaster(
        name="lab",
        api_url="https://salt.example:8000",
        username="u",
        password="p",
    )
    import httpx

    master._client = httpx.AsyncClient(transport=transport, base_url="https://salt.example:8000")

    # monkey finger responses: after list, finger is called

    async def fake_finger(minion_id: str) -> str:
        return "sha256:fp"

    master._finger = fake_finger  # type: ignore[method-assign]
    pending = await master.list_pending()
    assert pending[0].minion_id == "ep_abc"
    assert pending[0].fingerprint == "sha256:fp"
    await master.close()
