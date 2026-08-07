"""Unit tests for Service Center transport stack (PRD v1.6 M1)."""

from __future__ import annotations

import pytest

from core.config import Settings
from core.deployment_mode import DeploymentMode, DeploymentModeError, validate_deployment_mode
from integrations.service_center.auth import generate_device_keypair
from integrations.service_center.circuit_breaker import CircuitBreaker, CircuitOpenError, CircuitState
from integrations.service_center.contract_negotiator import negotiate_contract
from integrations.service_center.request_signer import build_signed_headers, verify_request_signature
from integrations.service_center.retry_policy import RetryPolicy, compute_delay, is_retryable_status


def _settings(**kwargs: object) -> Settings:
    # Bypass env/.env so tests can force deployment mode fields
    return Settings.model_construct(**kwargs)  # type: ignore[arg-type]


# @lat: [[tests#Endpoint Sync#Production mode forbids stub]]
def test_production_mode_forbids_stub() -> None:
    settings = _settings(
        deployment_mode="production_http",
        service_center_use_stub=True,
        service_center_base_url="https://center.example.com",
    )
    with pytest.raises(DeploymentModeError) as ei:
        validate_deployment_mode(settings)
    assert ei.value.code == "stub_forbidden"


def test_staging_requires_https_url() -> None:
    settings = _settings(
        deployment_mode="staging_http",
        service_center_use_stub=False,
        service_center_base_url="",
    )
    with pytest.raises(DeploymentModeError):
        validate_deployment_mode(settings)


def test_development_stub_ok() -> None:
    settings = _settings(deployment_mode="development_stub", service_center_use_stub=True)
    assert validate_deployment_mode(settings) == DeploymentMode.DEVELOPMENT_STUB


def test_retryable_status_set() -> None:
    assert is_retryable_status(503)
    assert not is_retryable_status(400)
    assert compute_delay(1, RetryPolicy()) >= 0.5


def test_circuit_breaker_opens() -> None:
    cb = CircuitBreaker(failure_threshold=2, open_seconds=60)
    cb.record_failure("center.example.com", error="boom")
    cb.record_failure("center.example.com", error="boom")
    assert cb.hosts["center.example.com"].state == CircuitState.OPEN
    with pytest.raises(CircuitOpenError):
        cb.before_call("center.example.com")


def test_device_request_signature_roundtrip() -> None:
    kp = generate_device_keypair()
    body = b'{"a":1}'
    headers = build_signed_headers(
        method="POST",
        path="/api/v1/x",
        body=body,
        endpoint_id="ep-1",
        private_key_b64=kp.private_key_b64,
    )
    assert verify_request_signature(
        method="POST",
        path="/api/v1/x",
        body=body,
        headers=headers,
        public_key_b64=kp.public_key_b64,
    )
    assert not verify_request_signature(
        method="POST",
        path="/api/v1/x",
        body=b'{"a":2}',
        headers=headers,
        public_key_b64=kp.public_key_b64,
    )


def test_protocol_negotiation_disables_incompatible_channel() -> None:
    contract = negotiate_contract(
        {
            "protocolVersions": ["1.0"],
            "assignmentVersions": ["9"],
            "desiredStateVersions": ["1"],
            "eventSchemaVersions": ["1"],
            "artifactProtocolVersions": ["1"],
        }
    )
    assert contract.channel_enabled["desired_state"] is True
    assert contract.channel_enabled["task_assignment"] is False
