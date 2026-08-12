from __future__ import annotations


def test_health(client):
    resp = client.get("/salt/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_ready(client):
    resp = client.get("/salt/v1/ready")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ready"
