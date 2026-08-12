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
