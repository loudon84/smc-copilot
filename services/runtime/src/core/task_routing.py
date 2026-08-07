from __future__ import annotations

from pydantic import BaseModel

from core.enums import TaskType


class RoutingRule(BaseModel):
    profile_type: str
    """Matches Profile.type column (coding, writer, ...)"""
    require_approval: bool = False


DEFAULT_TASK_ROUTING: dict[str, RoutingRule] = {
    TaskType.CODING_TASK.value: RoutingRule(profile_type="coding", require_approval=True),
    TaskType.REVIEW_TASK.value: RoutingRule(profile_type="coding", require_approval=False),
    TaskType.DOC_TASK.value: RoutingRule(profile_type="writer", require_approval=False),
    TaskType.RESEARCH_TASK.value: RoutingRule(profile_type="research", require_approval=False),
    TaskType.WRITER_TASK.value: RoutingRule(profile_type="writer", require_approval=False),
    TaskType.OPS_TASK.value: RoutingRule(profile_type="default", require_approval=True),
    TaskType.PROFILE_TASK.value: RoutingRule(profile_type="default", require_approval=True),
    TaskType.FINANCE_TASK.value: RoutingRule(profile_type="finance", require_approval=True),
    TaskType.SALES_TASK.value: RoutingRule(profile_type="default", require_approval=False),
}


def merge_routing(overrides: dict[str, RoutingRule]) -> dict[str, RoutingRule]:
    merged = {k: v.model_copy() for k, v in DEFAULT_TASK_ROUTING.items()}
    merged.update(overrides)
    return merged
