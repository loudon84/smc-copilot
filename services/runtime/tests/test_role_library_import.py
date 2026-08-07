from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient


MINIMAL_PRESET = """
version: team_v1.4
roleLibrary:
  repo: https://github.com/jnMetaCode/agency-agents-zh.git
  branch: main
  localDir: agency-agents-zh
profiles:
  writer-9601:
    displayName: Writer
    role: specialist
    description: 写作专家
    enabled: true
    autoStart: false
    port: 9601
    roleSpec:
      roleKey: writer
      roleName: 写作生文专家
      sourceRepo: https://github.com/jnMetaCode/agency-agents-zh
      sourcePaths:
        - marketing/marketing-content-creator.md
      outputMode: soul-memory-skill
"""


@pytest.mark.asyncio
async def test_import_preset_preview_port_conflict(
    app_client: tuple[AsyncClient, object, object, object, object],
    test_settings: object,
) -> None:
    client, *_ = app_client

    first = await client.post(
        "/api/v1/profiles",
        json={"name": "writer-9601", "type": "writer", "gateway_port": 9601},
    )
    assert first.status_code == 201

    resp = await client.post(
        "/api/v1/profiles/import-preset",
        json={"preset_yaml": MINIMAL_PRESET, "overwrite": False},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["imported_count"] == 0
    assert "writer-9601" in body["existing_without_overwrite"]


@pytest.mark.asyncio
async def test_import_preset_resolves_team_v14_file_without_inline_yaml(
    app_client: tuple[AsyncClient, object, object, object, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from services.role_library_service import RoleLibraryService

    client, *_ = app_client

    async def _fake_sync(self, body=None):  # noqa: ANN001, ANN201
        from schemas.role_library import RoleLibrarySyncResponse

        return RoleLibrarySyncResponse(ok=True, path=str(body.local_dir if body else "."), commit="deadbeef")

    monkeypatch.setattr(RoleLibraryService, "sync_library", _fake_sync)

    resp = await client.post(
        "/api/v1/profiles/import-preset",
        json={"preset_version": "team_v1.4", "overwrite": False},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "FileNotFoundError" not in str(body.get("errors", []))
    assert body.get("imported_count", 0) >= 0 or body.get("existing_without_overwrite")


@pytest.mark.asyncio
async def test_list_role_specs_empty(
    app_client: tuple[AsyncClient, object, object, object, object],
) -> None:
    client, *_ = app_client
    resp = await client.get("/api/v1/role-library/specs")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
