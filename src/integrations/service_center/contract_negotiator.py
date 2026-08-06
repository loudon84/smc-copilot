"""Runtime protocol negotiation with Service Center (PRD v1.6 FR-106)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from core.logging import get_logger

logger = get_logger(__name__)

SUPPORTED_PROTOCOL = ("1.0",)
SUPPORTED_ASSIGNMENT = ("2",)
SUPPORTED_DESIRED_STATE = ("1",)
SUPPORTED_EVENT_SCHEMA = ("1",)
SUPPORTED_ARTIFACT = ("1",)


@dataclass
class RuntimeContract:
    protocol_versions: list[str] = field(default_factory=list)
    assignment_versions: list[str] = field(default_factory=list)
    desired_state_versions: list[str] = field(default_factory=list)
    event_schema_versions: list[str] = field(default_factory=list)
    artifact_protocol_versions: list[str] = field(default_factory=list)
    negotiated: dict[str, str | None] = field(default_factory=dict)
    channel_enabled: dict[str, bool] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "protocolVersions": self.protocol_versions,
            "assignmentVersions": self.assignment_versions,
            "desiredStateVersions": self.desired_state_versions,
            "eventSchemaVersions": self.event_schema_versions,
            "artifactProtocolVersions": self.artifact_protocol_versions,
            "negotiated": self.negotiated,
            "channelEnabled": self.channel_enabled,
        }


def _pick(supported: tuple[str, ...], offered: list[str]) -> str | None:
    for s in supported:
        if s in offered:
            return s
    return None


def negotiate_contract(payload: dict[str, Any]) -> RuntimeContract:
    contract = RuntimeContract(
        protocol_versions=list(payload.get("protocolVersions") or []),
        assignment_versions=list(payload.get("assignmentVersions") or []),
        desired_state_versions=list(payload.get("desiredStateVersions") or []),
        event_schema_versions=list(payload.get("eventSchemaVersions") or []),
        artifact_protocol_versions=list(payload.get("artifactProtocolVersions") or []),
    )
    proto = _pick(SUPPORTED_PROTOCOL, contract.protocol_versions)
    assign = _pick(SUPPORTED_ASSIGNMENT, contract.assignment_versions)
    desired = _pick(SUPPORTED_DESIRED_STATE, contract.desired_state_versions)
    events = _pick(SUPPORTED_EVENT_SCHEMA, contract.event_schema_versions)
    artifacts = _pick(SUPPORTED_ARTIFACT, contract.artifact_protocol_versions)
    contract.negotiated = {
        "protocol": proto,
        "assignment": assign,
        "desiredState": desired,
        "eventSchema": events,
        "artifact": artifacts,
    }
    # Incompatible channels stop; local chat unaffected
    contract.channel_enabled = {
        "desired_state": desired is not None and proto is not None,
        "task_assignment": assign is not None and proto is not None,
        "task_control": assign is not None and proto is not None,
        "events": events is not None and proto is not None,
        "artifacts": artifacts is not None and proto is not None,
    }
    if proto is None:
        logger.warning("runtime_contract_protocol_incompatible", offered=contract.protocol_versions)
    return contract


class ContractNegotiator:
    def __init__(self) -> None:
        self._contract: RuntimeContract | None = None

    @property
    def contract(self) -> RuntimeContract | None:
        return self._contract

    def apply(self, payload: dict[str, Any]) -> RuntimeContract:
        self._contract = negotiate_contract(payload)
        return self._contract

    def channel_allowed(self, channel: str) -> bool:
        if self._contract is None:
            return True
        return bool(self._contract.channel_enabled.get(channel, True))
