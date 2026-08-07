"""Resource apply adapters (PRD FR-301)."""

from runtime.resources.base import (
    ApplyResult,
    ResourceAdapter,
    ResourceContext,
    ResourceDesired,
    ResourceRollbackSnapshot,
)
from runtime.resources.registry import build_adapter_registry, build_resource_context, get_adapter

__all__ = [
    "ApplyResult",
    "ResourceAdapter",
    "ResourceContext",
    "ResourceDesired",
    "ResourceRollbackSnapshot",
    "build_adapter_registry",
    "build_resource_context",
    "get_adapter",
]
