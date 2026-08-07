"""Bootstrap config validation and one-time token tests (FR-19/20)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from schemas.bootstrap import BootstrapConfigRequest
from services.bootstrap_service import find_forbidden_provider_keys


def _sample_config(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "tenantId": "smc",
        "runtimeChannel": "stable",
        "runtimeManifestUrl": "https://example.com/runtime.json",
        "hermesManifestUrl": "https://example.com/hermes.json",
        "requireAuth": True,
        "allowLegacyToken": False,
        "defaultInstance": {"name": "default", "gatewayPort": 8642, "autoStart": True},
    }
    base.update(overrides)
    return base


# @lat: [[tests#Bootstrap 配置校验]]
def test_bootstrap_config_rejects_extra_provider_key_fields() -> None:
    with pytest.raises(ValidationError):
        BootstrapConfigRequest.model_validate(_sample_config(openaiApiKey="sk-test"))


# @lat: [[tests#Bootstrap 配置校验#拒绝嵌套 Provider Key]]
def test_find_forbidden_provider_keys_nested() -> None:
    raw = _sample_config()
    raw["defaultInstance"] = {
        "name": "default",
        "gatewayPort": 8642,
        "autoStart": True,
        "providerApiKey": "secret",
    }
    violations = find_forbidden_provider_keys(raw)
    assert any("providerApiKey" in v for v in violations)


# @lat: [[tests#Bootstrap 配置校验#允许 manifest URL]]
def test_bootstrap_config_accepts_manifest_urls() -> None:
    config = BootstrapConfigRequest.model_validate(_sample_config())
    assert not find_forbidden_provider_keys(config.model_dump(by_alias=True))
