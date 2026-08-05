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
)


# @lat: [[profiles-instances#能力协商]]
@dataclass
class CapabilityRegistry:
    """Capability negotiation for Desktop (PRD §5.5 / §7.1)."""

    api_version: str = "1.0"
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
