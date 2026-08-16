from __future__ import annotations

from core.auth import Scope


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_ready_lab(client):
    resp = client.get("/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["rpcBackend"] == "fake"
    assert body["persistence"] == "memory"


def test_clients_require_auth(client):
    resp = client.get("/api/v1/opsi/clients")
    assert resp.status_code == 401


def test_list_clients_and_products(client, token):
    headers = {"Authorization": f"Bearer {token(Scope.INVENTORY_READ.value)}"}
    clients = client.get("/api/v1/opsi/clients", headers=headers)
    assert clients.status_code == 200
    ids = {item["clientId"] for item in clients.json()["items"]}
    assert "client-a.example" in ids
    products = client.get("/api/v1/opsi/products", headers=headers)
    assert products.status_code == 200
    assert products.json()["items"][0]["productId"] == "smc-hermes-agent"
