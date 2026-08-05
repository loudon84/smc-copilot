"""Gated Windows / real Hermes E2E (PRD 13.3–13.4).

Skipped unless COPILOT_E2E_HERMES=1 or COPILOT_E2E_INSTALLER=1.
Requires real Wheelhouse artifacts and Windows host.
"""

from __future__ import annotations

import os

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("COPILOT_E2E_HERMES") != "1" and os.environ.get("COPILOT_E2E_INSTALLER") != "1",
    reason="Set COPILOT_E2E_HERMES=1 or COPILOT_E2E_INSTALLER=1 to run gated E2E",
)


# @lat: [[tests#验收]]
@pytest.mark.asyncio
async def test_real_hermes_gateway_chat_probe():
    """Placeholder gated E2E: install real hermes wheel → gateway → bearer models → chat."""
    assert os.environ.get("COPILOT_E2E_HERMES") == "1", "enable COPILOT_E2E_HERMES"
    # Real steps live in scripts/runtime-smoke-test-windows.ps1 -RequireHermes -RequireGateway
    pytest.skip("Invoke scripts/runtime-smoke-test-windows.ps1 -RequireHermes -RequireGateway on CI Nightly")


@pytest.mark.asyncio
async def test_installer_quiet_install_flow():
    assert os.environ.get("COPILOT_E2E_INSTALLER") == "1"
    pytest.skip("Invoke Setup.exe /quiet on clean Windows 11 Pro runner")
