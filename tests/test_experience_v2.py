"""Experience v2 auto evidence / fingerprint tests (PRD v1.6 FR-1001~1004)."""

from __future__ import annotations

import pytest

from core.capabilities import get_capability_registry
from runtime.experience_fingerprint import evidence_fingerprint, quality_score, should_suggest_candidate
from services.experience_auto_capture import ExperienceAutoCapture


# @lat: [[tests#Experience redaction and candidates#Experience fingerprint is stable]]
def test_fingerprint_stable() -> None:
    a = evidence_fingerprint(evidence_type="workflow_trace", steps=["a", "b"], tool_sequence=["shell"])
    b = evidence_fingerprint(evidence_type="workflow_trace", steps=["a", "b"], tool_sequence=["shell"])
    c = evidence_fingerprint(evidence_type="workflow_trace", steps=["a"], tool_sequence=["shell"])
    assert a == b
    assert a != c


def test_quality_threshold() -> None:
    low = quality_score(repeat_count=1, result_quality=0.2, failure_rate=0.9)
    high = quality_score(repeat_count=5, successful_reuse_count=3, user_confirmation=2, result_quality=0.9)
    assert not should_suggest_candidate(low)
    assert should_suggest_candidate(high)


# @lat: [[tests#Experience redaction and candidates#Auto evidence deduplicates by fingerprint]]
@pytest.mark.asyncio
async def test_auto_evidence_dedup(app_client) -> None:
    client, _supervisor, settings, _hub, app = app_client
    engine = app.state.engine
    from db.session import create_sessionmaker

    session_maker = create_sessionmaker(engine)
    async with session_maker() as session:
        capture = ExperienceAutoCapture(settings, session)
        first = await capture.on_event(
            event_type="task.completed",
            task_id="t1",
            run_id="r1",
            sequence=1,
            payload={"steps": ["s1"], "tools": ["tool.a"]},
        )
        assert first is not None
        assert first["deduplicated"] is False
        assert first["autoSubmit"] is False
        second = await capture.on_event(
            event_type="task.completed",
            task_id="t2",
            run_id="r2",
            sequence=1,
            payload={"steps": ["s1"], "tools": ["tool.a"]},
        )
        assert second is not None
        assert second["deduplicated"] is True
        assert second["repeatCount"] >= 2
        await session.commit()


def test_api_version_is_1_3() -> None:
    import core.capabilities as cap

    cap._registry = None
    reg = get_capability_registry()
    assert reg.api_version == "1.3"
    assert reg.has("experience.auto-evidence")
    assert reg.has("workers.supervisor")
