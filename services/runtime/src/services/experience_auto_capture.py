"""Auto Evidence hooks from real task events (PRD v1.6 FR-1001~1005)."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from db.models.endpoint_sync import ExperienceEvidence
from db.models.experience_v2 import ExperienceEvidenceLink, ExperienceFingerprint
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from runtime.experience_fingerprint import (
    AUTO_EVIDENCE_EVENTS,
    EVENT_TO_EVIDENCE_TYPE,
    evidence_fingerprint,
    provenance_payload,
    quality_score,
    should_suggest_candidate,
)
from runtime.experience_redactor import redact_payload
from services.experience_candidate_service import ExperienceCandidateService


class ExperienceAutoCapture:
    """Create/merge Evidence from task run events; never auto-submit to Center."""

    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._session = session
        self._repo = EndpointSyncRepository(session)

    async def on_event(
        self,
        *,
        event_type: str,
        task_id: str,
        run_id: str,
        sequence: int,
        payload: dict[str, Any] | None = None,
        endpoint_id: str | None = None,
        profile_version: str | None = None,
        skill_versions: list[str] | None = None,
        tool_names: list[str] | None = None,
        artifact_ids: list[str] | None = None,
    ) -> dict[str, Any] | None:
        if event_type not in AUTO_EVIDENCE_EVENTS:
            return None
        payload = payload or {}
        evidence_type = EVENT_TO_EVIDENCE_TYPE.get(event_type, "workflow_trace")
        tools = tool_names or list(payload.get("tools") or payload.get("toolNames") or [])
        fp = evidence_fingerprint(
            evidence_type=evidence_type,
            steps=list(payload.get("steps") or [event_type]),
            tool_sequence=tools,
            approval_decisions=list(payload.get("approvals") or []),
            error_code=str(payload.get("errorCode") or payload.get("error_code") or ""),
            repair_result=str(payload.get("repairResult") or ""),
        )

        existing_fp = (
            await self._session.execute(select(ExperienceFingerprint).where(ExperienceFingerprint.fingerprint == fp))
        ).scalar_one_or_none()

        if existing_fp is not None:
            row = existing_fp
            row.repeat_count = int(row.repeat_count or 1) + 1
            if event_type == "task.completed":
                row.successful_reuse_count = int(row.successful_reuse_count or 0) + 1
            if event_type == "task.failed":
                fails = int(row.repeat_count or 1)
                ok = int(row.successful_reuse_count or 0)
                row.failure_rate = fails / max(1, fails + ok)
            score = quality_score(
                repeat_count=row.repeat_count,
                successful_reuse_count=row.successful_reuse_count or 0,
                user_confirmation=row.user_confirmation_count or 0,
                result_quality=float(row.result_quality or 0.5),
                policy_compliance=float(row.policy_compliance or 1.0),
                failure_rate=float(row.failure_rate or 0.0),
            )
            # Dedup: do not create another Evidence / Candidate
            return {
                "deduplicated": True,
                "fingerprint": fp,
                "repeatCount": row.repeat_count,
                "qualityScore": score,
                "suggestCandidate": should_suggest_candidate(score),
            }

        score = quality_score(
            repeat_count=1,
            successful_reuse_count=1 if event_type == "task.completed" else 0,
            result_quality=0.7 if event_type == "task.completed" else 0.4,
            failure_rate=1.0 if event_type == "task.failed" else 0.0,
        )
        redacted = redact_payload(
            {
                "eventType": event_type,
                "provenance": provenance_payload(
                    task_id=task_id,
                    run_id=run_id,
                    sequence_start=sequence,
                    sequence_end=sequence,
                    artifact_ids=artifact_ids,
                    profile_version=profile_version,
                    skill_versions=skill_versions,
                    tool_names=tools,
                ),
                "payload": payload,
            }
        )
        evidence = ExperienceEvidence(
            endpoint_id=endpoint_id,
            task_id=task_id,
            run_id=run_id,
            evidence_type=evidence_type,
            source_refs_json=json.dumps([f"run:{run_id}", f"seq:{sequence}"], ensure_ascii=False),
            summary=f"auto:{event_type}",
            redacted_payload_json=json.dumps(redacted, ensure_ascii=False),
            confidence=score,
            sensitivity="internal",
            fingerprint=fp,
            quality_score=score,
        )
        await self._repo.add_evidence(evidence)
        await self._session.flush()

        link = ExperienceEvidenceLink(
            evidence_id=evidence.id,
            task_id=task_id,
            run_id=run_id,
            event_sequence_start=sequence,
            event_sequence_end=sequence,
            artifact_ids_json=json.dumps(artifact_ids or [], ensure_ascii=False),
            profile_version=profile_version,
            skill_versions_json=json.dumps(skill_versions or [], ensure_ascii=False),
            tool_names_json=json.dumps(tools, ensure_ascii=False),
        )
        self._session.add(link)

        fp_row = ExperienceFingerprint(
            fingerprint=fp,
            evidence_type=evidence_type,
            repeat_count=1,
            successful_reuse_count=1 if event_type == "task.completed" else 0,
            failure_rate=1.0 if event_type == "task.failed" else 0.0,
            result_quality=0.7 if event_type == "task.completed" else 0.4,
            policy_compliance=1.0,
            last_evidence_id=evidence.id,
        )
        self._session.add(fp_row)

        suggest = should_suggest_candidate(score)
        candidate_id = None
        if suggest:
            # Draft candidate only — still requires Desktop user approve before StaffDeck submit
            candid = ExperienceCandidateService(self._settings, self._session)
            created = await candid.create(
                {
                    "title": f"Auto candidate from {event_type}",
                    "candidateType": evidence_type,
                    "summary": f"Suggested from evidence {evidence.id}",
                    "evidenceRefs": [evidence.id],
                    "endpointId": endpoint_id,
                    "content": {"fingerprint": fp, "qualityScore": score},
                    "status": "draft",
                }
            )
            candidate_id = created.get("id")

        return {
            "deduplicated": False,
            "evidenceId": evidence.id,
            "fingerprint": fp,
            "qualityScore": score,
            "suggestCandidate": suggest,
            "candidateId": candidate_id,
            "autoSubmit": False,
        }
