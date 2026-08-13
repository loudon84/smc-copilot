from __future__ import annotations

import asyncio
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from core.logging import safe_log_fields
from db.repositories.interfaces import (
    AuditEventRecord,
    ControlPlaneIncidentRecord,
    EndpointFactSampleRecord,
    EndpointObservationRecord,
    RepositoryBundle,
    RolloutObservationRecord,
)
from db.unit_of_work import unit_of_work
from integrations.salt_master import SaltMaster

OBSERVATION_WINDOWS = ("15m", "1h", "6h", "24h", "7d")
WINDOW_SECONDS = {
    "15m": 900,
    "1h": 3600,
    "6h": 21600,
    "24h": 86400,
    "7d": 604800,
}


class ControlPlaneObserver:
    """Aggregates Master / heartbeat / job / rollout health every 60s (v2.4)."""

    def __init__(
        self,
        *,
        masters: list[SaltMaster],
        session_factory: Any | None = None,
        repos: RepositoryBundle | None = None,
        interval_seconds: float = 60.0,
        master_unavailable_threshold: int = 3,
    ) -> None:
        if session_factory is None and repos is None:
            raise ValueError("ControlPlaneObserver requires session_factory or repos")
        self.masters = masters
        self.session_factory = session_factory
        self.repos = repos
        self.interval_seconds = interval_seconds
        self.master_unavailable_threshold = master_unavailable_threshold
        self._consecutive_master_failures = 0
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self.metrics: dict[str, float | int] = {
            "master_unavailable_seconds": 0,
            "rollout_pause_master_unavailable_total": 0,
            "gateway_health_failure_total": 0,
            "endpoint_heartbeat_age_seconds": 0,
            "p0_incident_total": 0,
            "p1_incident_total": 0,
        }
        self.windows: dict[str, dict[str, Any]] = {w: {} for w in OBSERVATION_WINDOWS}
        self.last_tick_at: datetime | None = None
        self.master_available = True
        self._window_last_write: dict[str, datetime] = {}

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop.clear()
            self._task = asyncio.create_task(self._loop(), name="control-plane-observer")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            await asyncio.wait([self._task], timeout=5)

    async def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                await self.tick()
            except Exception:
                pass
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.interval_seconds)
            except TimeoutError:
                continue

    async def tick(self) -> None:
        if self.session_factory is not None:
            async with unit_of_work(self.session_factory) as uow:
                await self._tick_once(uow.repos)
            return
        assert self.repos is not None
        await self._tick_once(self.repos)

    async def _tick_once(self, repos: RepositoryBundle) -> None:
        now = datetime.now(UTC)
        self.last_tick_at = now

        master_ok = await self._check_masters()
        self.master_available = master_ok
        if not master_ok:
            self._consecutive_master_failures += 1
            self.metrics["master_unavailable_seconds"] = int(self.metrics["master_unavailable_seconds"]) + int(
                self.interval_seconds
            )
            # 180s threshold ≈ 3 ticks at 60s
            if self._consecutive_master_failures >= self.master_unavailable_threshold:
                paused = await self._pause_rollouts(repos, now, reason="master_unavailable")
                self.metrics["rollout_pause_master_unavailable_total"] = (
                    int(self.metrics["rollout_pause_master_unavailable_total"]) + paused
                )
                if paused:
                    await repos.control_plane_incidents.create(
                        ControlPlaneIncidentRecord(
                            id=f"inc_{secrets.token_urlsafe(8)}",
                            severity="P0",
                            code="MASTER_UNAVAILABLE",
                            message="Salt Master unavailable beyond threshold",
                            metadata_redacted=safe_log_fields(seconds=self.metrics["master_unavailable_seconds"]),
                        )
                    )
                    self.metrics["p0_incident_total"] = int(self.metrics["p0_incident_total"]) + 1
        else:
            self._consecutive_master_failures = 0

        # Auto-pause on open P0/P1 incidents or SLO flags in extras.
        open_incidents = await repos.control_plane_incidents.list_open()
        if any(i.severity in {"P0", "P1"} for i in open_incidents):
            await self._pause_rollouts(repos, now, reason="open_p0_p1")

        reclaimed = await repos.control_jobs.expire_stale_leases(now=now)
        await self._collect_endpoint_facts(repos, now, master_ok)
        snapshot = {
            "at": now.isoformat(),
            "masterAvailable": master_ok,
            "leasesExpired": reclaimed,
            "masterUnavailableSeconds": self.metrics["master_unavailable_seconds"],
            "rolloutPauses": self.metrics["rollout_pause_master_unavailable_total"],
            "openIncidents": len(open_incidents),
        }
        for window in OBSERVATION_WINDOWS:
            last = self._window_last_write.get(window)
            period = WINDOW_SECONDS[window]
            if last is None or (now - last).total_seconds() >= min(period, self.interval_seconds):
                aggregated = await self._aggregate_window(repos, now, window)
                payload = {**snapshot, **aggregated}
                self.windows[window] = payload
                self._window_last_write[window] = now
                await self._persist_windows(repos, now, window, payload)

    async def _persist_windows(
        self, repos: RepositoryBundle, now: datetime, window: str, snapshot: dict[str, Any]
    ) -> None:
        active = await repos.rollouts.list_active()
        for rollout in active:
            await repos.rollout_observations.append(
                RolloutObservationRecord(
                    rollout_id=rollout.id,
                    window=window,
                    payload_json=dict(snapshot),
                    captured_at=now,
                )
            )
            for target in await repos.rollouts.list_targets(rollout.id):
                facts = await repos.endpoint_fact_samples.list_since(
                    target.endpoint_id, since=now - timedelta(seconds=WINDOW_SECONDS[window])
                )
                latest_fact = facts[-1].payload_json if facts else {}
                gap = False
                if facts:
                    times = sorted(f.captured_at for f in facts if f.captured_at is not None)
                    for prev, nxt in zip(times, times[1:], strict=False):
                        if (nxt - prev).total_seconds() > 300:
                            gap = True
                            break
                if gap:
                    await repos.control_plane_incidents.create(
                        ControlPlaneIncidentRecord(
                            id=f"inc_{secrets.token_urlsafe(8)}",
                            severity="P1",
                            code="OBSERVATION_GAP",
                            message="observation gap exceeds 5 minutes",
                            rollout_id=rollout.id,
                            endpoint_id=target.endpoint_id,
                            metadata_redacted=safe_log_fields(window=window),
                        )
                    )
                await repos.endpoint_observations.append(
                    EndpointObservationRecord(
                        endpoint_id=target.endpoint_id,
                        window=window,
                        payload_json={
                            **snapshot,
                            "rolloutId": rollout.id,
                            "targetState": target.state,
                            "gatewayHealth": latest_fact.get("gatewayHealth", "unknown"),
                            "owner": latest_fact.get("owner"),
                            "workProbeOk": latest_fact.get("workProbeOk"),
                            "factSource": latest_fact.get("source", "observer"),
                            "lastObservedAt": (
                                facts[-1].captured_at.isoformat() if facts and facts[-1].captured_at else None
                            ),
                            "sampleCount": len(facts),
                            "gap": gap,
                        },
                        captured_at=now,
                    )
                )

    async def _collect_endpoint_facts(self, repos: RepositoryBundle, now: datetime, master_ok: bool) -> None:
        seen: set[str] = set()
        for rollout in await repos.rollouts.list_active():
            for target in await repos.rollouts.list_targets(rollout.id):
                if target.endpoint_id in seen:
                    continue
                seen.add(target.endpoint_id)
                endpoint = await repos.endpoints.get(target.endpoint_id)
                jobs = await repos.control_jobs.list_for_endpoint(target.endpoint_id, limit=1)
                last_job = jobs[0] if jobs else None
                gateway_health = "unknown"
                owner = None
                work_ok = None
                # Never infer owner/gateway from target.state — only stored facts + live probes.
                ping_ok = None
                if self.masters:
                    primary = self.masters[0]
                    ping = getattr(primary, "ping", None)
                    if ping is not None:
                        try:
                            ping_ok = bool(await ping(target.endpoint_id))
                        except Exception:
                            ping_ok = False
                payload = {
                    "source": "observer",
                    "masterAvailable": master_ok,
                    "minionHeartbeatAt": endpoint.last_seen_at.isoformat()
                    if endpoint and endpoint.last_seen_at
                    else None,
                    "keyAccepted": ping_ok,
                    "gatewayHealth": gateway_health,
                    "owner": owner,
                    "workProbeOk": work_ok,
                    "jobStatus": last_job.status if last_job else None,
                    "jobId": last_job.id if last_job else None,
                    "capturedAt": now.isoformat(),
                }
                await repos.endpoint_fact_samples.append(
                    EndpointFactSampleRecord(
                        endpoint_id=target.endpoint_id,
                        payload_json=payload,
                        source="observer",
                        captured_at=now,
                    )
                )
                if gateway_health in {"failed", "unhealthy"} or work_ok is False:
                    await self._pause_rollouts(repos, now, reason="endpoint_probe_failed")
                    await repos.control_plane_incidents.create(
                        ControlPlaneIncidentRecord(
                            id=f"inc_{secrets.token_urlsafe(8)}",
                            severity="P0",
                            code="ENDPOINT_PROBE_FAILED",
                            message="gateway or work critical probe failed",
                            rollout_id=rollout.id,
                            endpoint_id=target.endpoint_id,
                            metadata_redacted=safe_log_fields(gatewayHealth=gateway_health),
                        )
                    )

    async def _aggregate_window(self, repos: RepositoryBundle, now: datetime, window: str) -> dict[str, Any]:
        since = now - timedelta(seconds=WINDOW_SECONDS[window])
        sample_count = 0
        gaps = 0
        for rollout in await repos.rollouts.list_active():
            for target in await repos.rollouts.list_targets(rollout.id):
                facts = await repos.endpoint_fact_samples.list_window(target.endpoint_id, since=since, until=now)
                sample_count += len(facts)
                times = sorted(f.captured_at for f in facts if f.captured_at is not None)
                for prev, nxt in zip(times, times[1:], strict=False):
                    if (nxt - prev).total_seconds() > 300:
                        gaps += 1
        return {"window": window, "sampleCount": sample_count, "gapCount": gaps, "since": since.isoformat()}

    async def _check_masters(self) -> bool:
        if not self.masters:
            return False
        for master in self.masters:
            ready = getattr(master, "ready", None)
            if ready is not None:
                if not await ready():
                    return False
            else:
                # Fake masters are considered available in lab/test.
                continue
        return True

    async def _pause_rollouts(self, repos: RepositoryBundle, now: datetime, *, reason: str) -> int:
        paused = 0
        known = await repos.rollouts.list_active()
        for record in known:
            if record.state in {
                "running",
                "advancing",
                "approved",
                "batch_running",
                "batch_observing",
                "final_observing",
            }:
                record.thresholds_json["pausedFrom"] = record.state
                record.state = "paused"
                await repos.rollouts.update(record)
                paused += 1
                await repos.audits.append(
                    AuditEventRecord(
                        id=f"aud_{secrets.token_urlsafe(8)}",
                        actor_type="system",
                        actor_id="observer",
                        action="rollout.paused",
                        target_type="rollout",
                        target_id=record.id,
                        request_id=None,
                        metadata_redacted=safe_log_fields(reason=reason),
                        occurred_at=now,
                    )
                )
        return paused

    def stability_report(self) -> dict[str, Any]:
        return {
            "masterAvailable": self.master_available,
            "metrics": dict(self.metrics),
            "windows": dict(self.windows),
            "lastTickAt": self.last_tick_at.isoformat() if self.last_tick_at else None,
        }


def _parse(value: str | None) -> datetime:
    if not value:
        return datetime.min.replace(tzinfo=UTC)
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(UTC) - timedelta(days=1)
