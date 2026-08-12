from __future__ import annotations

from app import create_app


def test_openapi_export_stable():
    app = create_app()
    first = app.openapi()
    second = app.openapi()
    assert first == second
    assert "openapi" in first
    paths = first.get("paths", {})
    assert "/salt/v1/health" in paths
    assert "/salt/v1/enrollments" in paths
    assert "/salt/v1/jobs" in paths
    assert "/salt/v1/endpoints/{endpoint_id}/status" in paths
    assert "/salt/v1/rollouts/{rollout_id}:approve" in paths
    assert "/salt/v1/observer/stability" in paths
