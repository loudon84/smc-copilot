"""Unit tests for Hermes Kanban command builder / allowed actions / errors."""

from __future__ import annotations

import pytest

from core.runtime_errors import RuntimeServiceError
from integrations.hermes.kanban import command_builder as cb
from integrations.hermes.kanban.allowed_actions import allowed_actions_for_status
from integrations.hermes.kanban.errors import raise_for_cli_failure
from schemas.kanban import CreateKanbanBoardInput, CreateKanbanTaskInput, KanbanTaskActionInput


def test_list_tasks_includes_board_slug() -> None:
    args = cb.list_tasks("project-a", status="ready", include_archived=True)
    assert args[:2] == ["--board", "project-a"]
    assert "list" in args
    assert "--json" in args
    assert "--status" in args and "ready" in args
    assert "--archived" in args


def test_create_task_args() -> None:
    args = cb.create_task(
        "default",
        CreateKanbanTaskInput(
            title="Analyze margin",
            body="details",
            assignee="finance-agent",
            priority=1,
            workspace="scratch",
            triage=True,
            skills=["finance-bi-query"],
        ),
    )
    assert args[:2] == ["--board", "default"]
    assert args[2:4] == ["create", "Analyze margin"]
    assert "--body" in args and "details" in args
    assert "--assignee" in args and "finance-agent" in args
    assert "--priority" in args and "1" in args
    assert "--workspace" in args and "scratch" in args
    assert "--triage" in args
    assert "--skill" in args and "finance-bi-query" in args
    assert args[-1] == "--json"


def test_boards_create_and_remove() -> None:
    create = cb.boards_create(CreateKanbanBoardInput(slug="erp", name="ERP"))
    assert create == ["boards", "create", "erp", "--name", "ERP"]
    remove = cb.boards_remove("erp", hard_delete=True)
    assert remove == ["boards", "rm", "erp", "--delete"]


@pytest.mark.parametrize(
    ("action", "extra", "expect"),
    [
        ("promote", {}, ["--board", "b", "promote", "T1"]),
        ("complete", {"result": "ok"}, ["--board", "b", "complete", "T1", "--result", "ok"]),
        ("block", {"reason": "waiting"}, ["--board", "b", "block", "T1", "waiting"]),
        ("unblock", {}, ["--board", "b", "unblock", "T1"]),
        ("reclaim", {"reason": "stuck"}, ["--board", "b", "reclaim", "T1", "--reason", "stuck"]),
        ("assign", {"assignee": "coding"}, ["--board", "b", "assign", "T1", "coding"]),
        ("archive", {}, ["--board", "b", "archive", "T1"]),
        ("schedule", {"reason": "later"}, ["--board", "b", "schedule", "T1", "later"]),
        ("specify", {}, ["--board", "b", "specify", "T1"]),
        ("decompose", {}, ["--board", "b", "decompose", "T1"]),
        ("link", {"parent_id": "P1"}, ["--board", "b", "link", "T1", "P1"]),
        ("unlink", {"parentId": "P1"}, ["--board", "b", "unlink", "T1", "P1"]),
    ],
)
def test_action_args(action: str, extra: dict, expect: list[str]) -> None:
    body = KanbanTaskActionInput(action=action, **extra)  # type: ignore[arg-type]
    assert cb.action_args("b", "T1", body) == expect


def test_dispatch_dry_run() -> None:
    assert cb.dispatch("ops", dry_run=True) == ["--board", "ops", "dispatch", "--json", "--dry-run"]


def test_allowed_actions_for_status() -> None:
    assert "promote" in allowed_actions_for_status("todo")
    assert "complete" in allowed_actions_for_status("ready")
    assert "reclaim" in allowed_actions_for_status("running")
    assert "unblock" in allowed_actions_for_status("blocked")
    assert allowed_actions_for_status("archived") == []
    assert "archive" in allowed_actions_for_status("done")


def test_raise_for_cli_failure_maps_codes() -> None:
    with pytest.raises(RuntimeServiceError) as ei:
        raise_for_cli_failure(
            exit_code=1,
            stdout="",
            stderr="board not found: missing",
        )
    assert ei.value.code == "KANBAN_BOARD_NOT_FOUND"

    with pytest.raises(RuntimeServiceError) as ei2:
        raise_for_cli_failure(
            exit_code=1,
            stdout="",
            stderr="unmet dependencies blocking promote",
        )
    assert ei2.value.code == "KANBAN_DEPENDENCY_BLOCKED"

    raise_for_cli_failure(exit_code=0, stdout="{}", stderr="")
