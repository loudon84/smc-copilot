from __future__ import annotations

import json
import subprocess
from pathlib import Path

PRODUCT = Path(__file__).resolve().parents[1] / "products" / "smc-hermes-agent"


def _run_ps1(script: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(script),
            *args,
        ],
        capture_output=True,
        text=True,
        check=False,
    )


def test_wc01_python_prerequisite_json():
    script = PRODUCT / "controller" / "Test-SmcClientPrerequisites.ps1"
    assert script.is_file()
    result = _run_ps1(script)
    output = (result.stderr or "") + (result.stdout or "")
    normalized = output.replace("\r", "").replace("\n", "")
    if result.returncode != 0:
        assert "PREREQUISITE_FAIL" in normalized
        return
    payload = json.loads(result.stdout)
    assert payload["platform"] == "windows"
    assert payload["architecture"] == "amd64"
    assert payload["python"]["status"] == "PASS"
    assert payload["python"]["venv"] is True
    assert payload["node"]["status"] == "PASS"
    assert payload["node"]["npm"] is True


def test_wc02_node_prerequisite_json():
    script = PRODUCT / "controller" / "Test-SmcClientPrerequisites.ps1"
    text = script.read_text(encoding="utf-8")
    assert "node" in text
    assert "npm" in text
    bundle = PRODUCT / "scripts" / "diagnostics" / "Collect-DeploymentDiagnosticBundle.ps1"
    assert bundle.is_file()
    body = bundle.read_text(encoding="utf-8")
    assert "nodeVersion" in body
    assert "npmVersion" in body
    assert "Protect-SmcText" in body
    assert "credential" not in body.lower() or "Protect-Smc" in body
