"""Fake Service Center scenario helpers for tests."""

from __future__ import annotations

from typing import Any

from integrations.service_center.client import StubServiceCenterClient


def build_fake_center(**kwargs: Any) -> StubServiceCenterClient:
    """Return a StubServiceCenterClient, optionally preloaded with changes."""
    client = StubServiceCenterClient()
    desired = kwargs.get("desired_state")
    if isinstance(desired, dict):
        client.enqueue_desired_state(
            revision=int(desired.get("revision") or 1),
            resources=list(desired.get("resources") or []),
            policies=desired.get("policies") or {},
            removed_resources=desired.get("removedResources") or [],
        )
    for assignment in kwargs.get("assignments") or []:
        client.enqueue_assignment(assignment)
    return client


def sample_desired_resources() -> list[dict[str, Any]]:
    return [
        {
            "resourceType": "profile",
            "resourceId": "sales-expert",
            "version": "2.1.0",
            "applyMode": "managed",
            "checksum": "abc123",
            "artifactUrl": "stub://profile/sales-expert",
            "signature": "stub-sig",
        },
        {
            "resourceType": "skill",
            "resourceId": "sales-analysis",
            "version": "1.3.0",
            "applyMode": "managed",
            "checksum": "def456",
        },
    ]


def sample_assignment(**overrides: Any) -> dict[str, Any]:
    base = {
        "taskId": "task-001",
        "assignmentId": "assignment-001",
        "assignmentVersion": 1,
        "taskType": "sales_analysis",
        "title": "分析客户采购变化",
        "instructions": "summarize",
        "profileRef": {"resourceId": "sales-expert", "version": "2.1.0"},
        "workspacePolicy": {},
        "approvalPolicy": {},
        "toolPolicy": {},
        "dataPolicy": {},
        "leaseSeconds": 300,
    }
    base.update(overrides)
    return base
