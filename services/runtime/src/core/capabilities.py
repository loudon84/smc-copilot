from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

# Single source of truth for Runtime API negotiation version (PRD v1.1 §12.2 / §13).
RUNTIME_API_VERSION = "2.0"

RuntimeFeatureId = Literal[
    "runtime.install",
    "runtime.update",
    "runtime.rollback",
    "runtime.doctor",
    "instances.multiple",
    "chat.stream",
    "sessions.read",
    "mcp.crud",
    "mcp.test",
    "secrets.manage",
    "pairing.device",
    "config.manage",
    "gateway.auth.internal",
    "instances.chat",
    "instances.sessions",
    "runtime.update.plan",
    "runtime.update.transactional",
    "runtime.job.cancel",
    "runtime.service.update",
    "runtime.bootstrap",
    "runtime.repair",
    "mcp.compile",
    "diagnostics.bundle",
    "artifact.signature",
    "endpoint.enrollment",
    "endpoint.inventory",
    "sync.cursor",
    "sync.desired-state",
    "sync.resources",
    "sync.offline-outbox",
    "sync.dead-letter",
    "tasks.remote.v2",
    "tasks.lease",
    "tasks.result.delivery",
    "artifacts.presigned-upload",
    "experience.capture",
    "experience.local-review",
    "experience.staffdeck.submit",
    "runtime.release.production",
    "runtime.maintenance.apply",
    "installer.windows.production",
    "deployment.production-mode",
    "service-center.http.production",
    "service-center.device-signature",
    "service-center.circuit-breaker",
    "sync.ack-outbox",
    "sync.signature-verification",
    "sync.sequence-gap",
    "sync.poison-message",
    "resources.real-apply",
    "resources.revision-rollback",
    "resources.actual-state-probe",
    "resources.artifact-cache-v2",
    "tasks.local-control-plane",
    "tasks.hermes-execution",
    "tasks.event-store",
    "tasks.event-replay",
    "tasks.cancel",
    "tasks.recovery",
    "tasks.scheduler",
    "approvals.task-scoped",
    "policies.effective-policy",
    "artifacts.streaming-upload",
    "artifacts.multipart-resume",
    "artifacts.encrypted-spool",
    "workers.supervisor",
    "observability.metrics",
    "observability.slo",
    "experience.auto-evidence",
    "chat.runtime.v2",
]


DEFAULT_FEATURES: tuple[RuntimeFeatureId, ...] = (
    "runtime.install",
    "runtime.update",
    "runtime.rollback",
    "runtime.doctor",
    "instances.multiple",
    "chat.stream",
    "sessions.read",
    "mcp.crud",
    "mcp.test",
    "secrets.manage",
    "pairing.device",
    "config.manage",
    "gateway.auth.internal",
    "instances.chat",
    "instances.sessions",
    "runtime.update.plan",
    "runtime.update.transactional",
    "runtime.job.cancel",
    "runtime.service.update",
    "runtime.bootstrap",
    "runtime.repair",
    "mcp.compile",
    "diagnostics.bundle",
    "artifact.signature",
    "endpoint.enrollment",
    "endpoint.inventory",
    "sync.cursor",
    "sync.desired-state",
    "sync.resources",
    "sync.offline-outbox",
    "sync.dead-letter",
    "tasks.remote.v2",
    "tasks.lease",
    "tasks.result.delivery",
    "artifacts.presigned-upload",
    "experience.capture",
    "experience.local-review",
    "experience.staffdeck.submit",
    "runtime.release.production",
    "runtime.maintenance.apply",
    "installer.windows.production",
    "deployment.production-mode",
    "service-center.http.production",
    "service-center.device-signature",
    "service-center.circuit-breaker",
    "sync.ack-outbox",
    "sync.signature-verification",
    "sync.sequence-gap",
    "sync.poison-message",
    "resources.real-apply",
    "resources.revision-rollback",
    "resources.actual-state-probe",
    "resources.artifact-cache-v2",
    "tasks.local-control-plane",
    "tasks.hermes-execution",
    "tasks.event-store",
    "tasks.event-replay",
    "tasks.cancel",
    "tasks.recovery",
    "tasks.scheduler",
    "approvals.task-scoped",
    "policies.effective-policy",
    "artifacts.streaming-upload",
    "artifacts.multipart-resume",
    "artifacts.encrypted-spool",
    "workers.supervisor",
    "observability.metrics",
    "observability.slo",
    "experience.auto-evidence",
    "chat.runtime.v2",
)


# @lat: [[profiles-instances#能力协商]]
# @lat: [[endpoint-sync#Capability]]
@dataclass
class CapabilityRegistry:
    """Capability negotiation for Desktop (PRD §5.5 / §7.1 / v1.6 §21 / v1.1 §13)."""

    api_version: str = RUNTIME_API_VERSION
    features: list[RuntimeFeatureId] = field(default_factory=lambda: list(DEFAULT_FEATURES))

    def list_features(self) -> list[RuntimeFeatureId]:
        return list(self.features)

    def has(self, feature: str) -> bool:
        return feature in self.features

    def to_dict(self) -> dict[str, object]:
        return {
            "apiVersion": self.api_version,
            "features": self.list_features(),
        }


_registry: CapabilityRegistry | None = None


def get_capability_registry() -> CapabilityRegistry:
    global _registry
    if _registry is None:
        _registry = CapabilityRegistry()
    return _registry
