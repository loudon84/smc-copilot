from __future__ import annotations

import pytest

from core.config import Settings, get_settings
from runtime.port_allocator import allocate_port, is_port_available


@pytest.fixture
def settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    monkeypatch.setenv("DEFAULT_GATEWAY_PORT", "18742")
    import core.config as config_mod

    config_mod._settings = None
    return get_settings()


def test_allocate_requested_port_when_free(settings: Settings) -> None:
    # Pick a free ephemeral-range port to avoid collisions with other tests / OS listeners
    candidate = 39999
    for offset in range(200):
        p = candidate - offset
        if is_port_available("127.0.0.1", p):
            assert allocate_port(settings, p, set()) == p
            return
    pytest.skip("no free candidate port found")


def test_allocate_rejects_port_used_by_another_profile(settings: Settings) -> None:
    with pytest.raises(ValueError, match="already used by another profile"):
        allocate_port(settings, 18742, {18742})


def test_allocate_auto_increments_from_default(settings: Settings) -> None:
    used = {18742, 18743}
    port = allocate_port(settings, None, used)
    assert port == 18744


def test_is_port_available_localhost() -> None:
    assert is_port_available("127.0.0.1", 59999) is True
