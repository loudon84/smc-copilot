"""Unit tests for PRD v1.6 Chat Command / Session Settings schemas."""

from __future__ import annotations

# @lat: [[tests#Chat Capability v1.6#Slash outcome shapes]]
def test_chat_command_execute_response_shapes() -> None:
    from schemas.chat_commands import ChatCommandExecuteResponse

    handled = ChatCommandExecuteResponse(result="handled", output="ok")
    assert handled.result == "handled"
    send = ChatCommandExecuteResponse(result="send_prompt", prompt="/status")
    assert send.prompt == "/status"
    err = ChatCommandExecuteResponse(result="error", message="boom")
    assert err.message == "boom"


def test_dashboard_rpc_uses_dashboard_port_not_gateway() -> None:
    from integrations.hermes.dashboard_rpc_client import (
        HermesDashboardRpcClient,
        resolve_dashboard_port,
    )

    assert resolve_dashboard_port(9119) == 9119
    client = HermesDashboardRpcClient(dashboard_port=9119, api_key="tok")
    assert "9119" in client.ws_url
    assert "/api/ws" in client.ws_url
    # Passing gateway_port must not bind WS to Gateway (8642).
    legacy = HermesDashboardRpcClient(gateway_port=8642)
    assert "9119" in legacy.ws_url or "HERMES_DASHBOARD" in legacy.ws_url
    assert ":8642/" not in legacy.ws_url


def test_session_chat_settings_patch_aliases() -> None:
    from schemas.session_chat_settings import SessionChatSettingsPatchBody

    body = SessionChatSettingsPatchBody.model_validate(
        {"modelId": "qwen", "contextFolder": "D:/projects/erp"}
    )
    assert body.model_id == "qwen"
    assert body.context_folder == "D:/projects/erp"


def test_session_file_item_role() -> None:
    from schemas.session_files import SessionFileItem

    item = SessionFileItem(
        fileId="f1",
        sessionId="s1",
        name="a.txt",
        role="context_file",
        isContext=True,
    )
    assert item.is_context is True
    assert item.role == "context_file"


def test_chat_run_event_types_include_v16() -> None:
    from schemas.chat_events import CHAT_RUN_EVENT_TYPES, validate_chat_run_event_type

    for t in (
        "command.started",
        "background.completed",
        "session.settings.changed",
        "workspace.changed",
        "file.created",
    ):
        assert validate_chat_run_event_type(t) == t
        assert t in CHAT_RUN_EVENT_TYPES


def test_normalize_slash_outcome_handled() -> None:
    from services.chat_command_service import ChatCommandService

    svc = object.__new__(ChatCommandService)
    out = svc._normalize_outcome({"type": "exec", "output": "compacted"}, name="compact", args="")
    assert out is not None
    assert out.result == "handled"
    assert out.output == "compacted"


def test_normalize_slash_outcome_send() -> None:
    from services.chat_command_service import ChatCommandService

    svc = object.__new__(ChatCommandService)
    out = svc._normalize_outcome({"type": "send", "message": "hello world"}, name="x", args="")
    assert out is not None
    assert out.result == "send_prompt"
    assert out.prompt == "hello world"
