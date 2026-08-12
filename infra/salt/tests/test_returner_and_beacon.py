from __future__ import annotations

import json
from pathlib import Path

from _returners import smc_backend
from _beacons import smc_hermes_health


def test_returner_redacts_and_writes(tmp_path: Path, monkeypatch) -> None:
    sink = tmp_path / "jobs.jsonl"
    monkeypatch.setenv("SMC_SALT_RETURN_SINK", str(sink))
    ok = smc_backend.returner(
        {
            "jid": "1",
            "id": "lab-minion-01",
            "fun": "smc_hermes.inspect",
            "success": True,
            "return": {"api_key": "plain-secret", "installed": False},
        }
    )
    assert ok is True
    line = sink.read_text(encoding="utf-8").strip()
    payload = json.loads(line)
    assert payload["return"]["api_key"] == "***"


def test_beacon_validate_and_emit(tmp_path: Path, monkeypatch) -> None:
    ok, msg = smc_hermes_health.validate([{"interval": 60}])
    assert ok is True
    assert "Valid" in msg
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "h"))
    events = smc_hermes_health.beacon({"hermes_home": str(tmp_path / "h")})
    assert events[0]["tag"] == "smc/hermes/health"
