from api.middleware.cors_asgi import _origin_is_allowed, _resolve_allow_origin


def test_localhost_vite_dev_origin_allowed() -> None:
    allowed = ["http://127.0.0.1", "http://localhost"]
    origin = "http://localhost:5173"
    assert _origin_is_allowed(origin, allowed)
    assert _resolve_allow_origin(origin, allowed) == origin


def test_no_mismatch_when_origin_present() -> None:
    allowed = ["http://127.0.0.1", "http://localhost"]
    assert _resolve_allow_origin("http://localhost:5173", allowed) == "http://localhost:5173"
    assert _resolve_allow_origin("https://evil.example", allowed) is None
