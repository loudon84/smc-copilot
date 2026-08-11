"""Build argv for `hermes kanban` with explicit --board scope (PRD §8)."""

from __future__ import annotations

from schemas.kanban import CreateKanbanBoardInput, CreateKanbanTaskInput, KanbanTaskActionInput


def with_board(board_slug: str | None, *args: str) -> list[str]:
    """Prefix kanban subcommand args with --board when slug is provided."""
    out: list[str] = []
    if board_slug:
        out.extend(["--board", board_slug])
    out.extend(args)
    return out


def boards_list(*, include_archived: bool = False) -> list[str]:
    args = ["boards", "list", "--json"]
    if include_archived:
        args.append("--all")
    return args


def boards_create(input: CreateKanbanBoardInput) -> list[str]:
    args = ["boards", "create", input.slug]
    if input.name:
        args.extend(["--name", input.name])
    return args


def boards_remove(board_slug: str, *, hard_delete: bool = False) -> list[str]:
    args = ["boards", "rm", board_slug]
    if hard_delete:
        args.append("--delete")
    return args


def list_tasks(
    board_slug: str,
    *,
    status: str | None = None,
    assignee: str | None = None,
    tenant: str | None = None,
    include_archived: bool = False,
) -> list[str]:
    args = with_board(board_slug, "list", "--json")
    if status:
        args.extend(["--status", status])
    if assignee:
        args.extend(["--assignee", assignee])
    if tenant:
        args.extend(["--tenant", tenant])
    if include_archived:
        args.append("--archived")
    return args


def show_task(board_slug: str, task_id: str) -> list[str]:
    return with_board(board_slug, "show", task_id, "--json")


def create_task(board_slug: str, input: CreateKanbanTaskInput) -> list[str]:
    args = with_board(board_slug, "create", input.title)
    if input.body:
        args.extend(["--body", input.body])
    if input.assignee:
        args.extend(["--assignee", input.assignee])
    if input.priority is not None:
        args.extend(["--priority", str(input.priority)])
    if input.tenant:
        args.extend(["--tenant", input.tenant])
    if input.workspace:
        args.extend(["--workspace", input.workspace])
    if input.triage:
        args.append("--triage")
    if input.max_retries is not None:
        args.extend(["--max-retries", str(input.max_retries)])
    for skill in input.skills or []:
        args.extend(["--skill", skill])
    args.append("--json")
    return args


def action_args(board_slug: str, task_id: str, input: KanbanTaskActionInput) -> list[str]:
    action = input.action
    if action == "assign":
        return with_board(board_slug, "assign", task_id, input.assignee or "none")
    if action == "complete":
        args = with_board(board_slug, "complete", task_id)
        if input.result:
            args.extend(["--result", input.result])
        return args
    if action == "block":
        args = with_board(board_slug, "block", task_id)
        if input.reason:
            args.append(input.reason)
        return args
    if action == "unblock":
        return with_board(board_slug, "unblock", task_id)
    if action == "archive":
        return with_board(board_slug, "archive", task_id)
    if action == "reclaim":
        args = with_board(board_slug, "reclaim", task_id)
        if input.reason:
            args.extend(["--reason", input.reason])
        return args
    if action == "promote":
        return with_board(board_slug, "promote", task_id)
    if action == "schedule":
        args = with_board(board_slug, "schedule", task_id)
        if input.reason:
            args.append(input.reason)
        if input.at:
            args.extend(["--at", input.at])
        return args
    if action == "specify":
        return with_board(board_slug, "specify", task_id)
    if action == "decompose":
        return with_board(board_slug, "decompose", task_id)
    if action == "link":
        if not input.parent_id:
            raise ValueError("parentId is required for link action")
        return with_board(board_slug, "link", task_id, input.parent_id)
    if action == "unlink":
        if not input.parent_id:
            raise ValueError("parentId is required for unlink action")
        return with_board(board_slug, "unlink", task_id, input.parent_id)
    raise ValueError(f"Unsupported kanban action: {action}")


def comment(board_slug: str, task_id: str, text: str) -> list[str]:
    return with_board(board_slug, "comment", task_id, text)


def assignees(board_slug: str) -> list[str]:
    return with_board(board_slug, "assignees", "--json")


def dispatch(board_slug: str, *, dry_run: bool = False) -> list[str]:
    args = with_board(board_slug, "dispatch", "--json")
    if dry_run:
        args.append("--dry-run")
    return args
