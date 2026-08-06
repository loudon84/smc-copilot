from __future__ import annotations

from dataclasses import dataclass, field


DEFAULT_FEATURES: tuple[str, ...] = (
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
    # PRD v1.5 §21
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
)


# @lat: [[profiles-instances#能力协商]]
# @lat: [[endpoint-sync#Capability]]
@dataclass
class CapabilityRegistry:
    """Capability negotiation for Desktop (PRD §5.5 / §7.1)."""

    api_version: str = "1.2"
    features: list[str] = field(default_factory=lambda: list(DEFAULT_FEATURES))

    def list_features(self) -> list[str]:
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
