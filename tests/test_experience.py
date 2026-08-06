"""Experience capture / candidate / StaffDeck submit tests."""

from __future__ import annotations

import pytest

from runtime.experience_redactor import redact_payload


# @lat: [[tests#Endpoint Sync#Experience redaction]]
def test_experience_redaction() -> None:
    redacted = redact_payload(
        {
            "apiKey": "sk-secret",
            "path": r"C:\Users\alice\secret.txt",
            "prompt": "full prompt text",
            "summary": "ok step",
        }
    )
    assert redacted["apiKey"] == "[REDACTED]"
    assert redacted["prompt"] == "[REDACTED]"
    assert "[REDACTED_PATH]" in redacted["path"]
    assert redacted["summary"] == "ok step"


# @lat: [[tests#Endpoint Sync#Evidence and candidate submit]]
@pytest.mark.asyncio
async def test_experience_candidate_submit(enrolled_client) -> None:
    client, app, center = enrolled_client

    from core.config import get_settings
    from services.experience_capture_service import ExperienceCaptureService

    endpoint_id = next(iter(center.enrolled.keys()))
    session_maker = app.state.session_maker
    async with session_maker() as session:
        captured = await ExperienceCaptureService(get_settings(), session).capture(
            evidence_type="workflow_trace",
            summary="good flow",
            payload={"apiKey": "x", "note": "safe"},
            endpoint_id=endpoint_id,
        )
        await session.commit()
        evidence_id = captured["id"]
        payload = captured.get("redactedPayload") or captured.get("payload") or {}
        assert payload.get("apiKey") == "[REDACTED]" or "apiKey" not in str(payload)

    listed = await client.get("/api/v1/experience/evidence")
    assert listed.status_code == 200
    assert any(e["id"] == evidence_id for e in listed.json())

    created = await client.post(
        "/api/v1/experience/candidates",
        json={
            "candidateType": "sop",
            "title": "Sales SOP",
            "summary": "how to analyze",
            "evidenceRefs": [evidence_id],
            "content": {"steps": ["a", "b"]},
        },
    )
    assert created.status_code == 200
    cand_id = created.json()["id"]
    assert created.json()["status"] == "draft"

    approved = await client.patch(
        f"/api/v1/experience/candidates/{cand_id}",
        json={"status": "approved_for_submit"},
    )
    assert approved.status_code == 200

    submitted = await client.post(f"/api/v1/experience/candidates/{cand_id}/submit")
    assert submitted.status_code == 200
    assert submitted.json()["status"] == "submitted"
    assert center.experience_submissions

    patched = await client.patch(
        f"/api/v1/experience/candidates/{cand_id}",
        json={"status": "published"},
    )
    assert patched.status_code >= 400
