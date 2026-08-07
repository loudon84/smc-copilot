from __future__ import annotations

from fastapi import APIRouter, Depends

from api.deps import get_task_routing_registry
from core.task_routing import RoutingRule
from schemas.v12_tasks import RoutingRuleOut, TaskRoutingPatch, TaskRoutingRulesResponse
from services.task_routing_registry import TaskRoutingRegistry

router = APIRouter(tags=["task-routing"])


def _serialize_rules(registry: TaskRoutingRegistry) -> TaskRoutingRulesResponse:
    merged = registry.all_rules()
    out = {
        k: RoutingRuleOut(profile_type=v.profile_type, require_approval=v.require_approval)
        for k, v in merged.items()
    }
    return TaskRoutingRulesResponse(rules=out)


@router.get("/task-routing", response_model=TaskRoutingRulesResponse)
async def get_task_routing(registry: TaskRoutingRegistry = Depends(get_task_routing_registry)) -> TaskRoutingRulesResponse:
    return _serialize_rules(registry)


@router.patch("/task-routing", response_model=TaskRoutingRulesResponse)
async def patch_task_routing(
    body: TaskRoutingPatch,
    registry: TaskRoutingRegistry = Depends(get_task_routing_registry),
) -> TaskRoutingRulesResponse:
    registry.patch_rules({
        k: RoutingRule(profile_type=v.profile_type, require_approval=v.require_approval) for k, v in body.rules.items()
    })
    return _serialize_rules(registry)
