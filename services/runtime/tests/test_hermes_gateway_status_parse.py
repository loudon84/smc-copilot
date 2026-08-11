"""Unit tests for Hermes Gateway status parsing and Windows no-window kwargs."""

from __future__ import annotations

# @lat: [[tests#Dev runtime gateway status probe]]

import subprocess
import sys

from integrations.hermes.cli_adapter import parse_hermes_gateway_running
from integrations.hermes.win_subprocess import windows_no_window_kwargs


def test_parse_gateway_status_running() -> None:
    # @lat: [[tests#Dev runtime gateway status probe#Parses running]]
    text = "✓ Gateway is running (PID: 24396)\n  (Running manually, not as a system service)\n"
    assert parse_hermes_gateway_running(text) is True


def test_parse_gateway_status_not_running() -> None:
    # @lat: [[tests#Dev runtime gateway status probe#Parses not running]]
    text = "✗ Gateway is not running\n\nTo start: hermes gateway run\n"
    assert parse_hermes_gateway_running(text) is False


def test_parse_hermes_status_gateway_service_section() -> None:
    # @lat: [[tests#Dev runtime gateway status probe#Parses hermes status section]]
    text = """
Gateway Service
  Status:       ✓ running
  Manager:      manual process
  PID(s):       24396
"""
    assert parse_hermes_gateway_running(text) is True
    text2 = """
Gateway Service
  Status:       ✗ not running
  Manager:      none
"""
    assert parse_hermes_gateway_running(text2) is False


def test_windows_no_window_kwargs() -> None:
    # @lat: [[tests#Dev runtime gateway status probe#Windows hide kwargs]]
    kwargs = windows_no_window_kwargs()
    if sys.platform == "win32":
        assert kwargs["creationflags"] == subprocess.CREATE_NO_WINDOW
        assert kwargs["startupinfo"].wShowWindow == subprocess.SW_HIDE
    else:
        assert kwargs == {}
