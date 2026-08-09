"""Hermes Supervisor metrics (PRD v1.5 §45) — in-process counters, no secrets in labels."""

from __future__ import annotations

from dataclasses import dataclass, field
from threading import Lock


@dataclass
class _InstanceMetrics:
    up: int = 0
    health_latency_ms: float = 0.0
    restart_total: int = 0
    crash_total: int = 0
    auth_failure_total: int = 0
    port_conflict_total: int = 0


class HermesSupervisorMetrics:
    def __init__(self) -> None:
        self._lock = Lock()
        self._by_instance: dict[str, _InstanceMetrics] = {}
        self._labels: dict[str, dict[str, str]] = {}

    def _get(self, instance_id: str, *, profile: str = "", port: int = 0) -> _InstanceMetrics:
        if instance_id not in self._by_instance:
            self._by_instance[instance_id] = _InstanceMetrics()
            self._labels[instance_id] = {
                "instanceId": instance_id,
                "profile": profile,
                "port": str(port),
            }
        elif profile or port:
            labs = self._labels[instance_id]
            if profile:
                labs["profile"] = profile
            if port:
                labs["port"] = str(port)
        return self._by_instance[instance_id]

    def set_up(self, instance_id: str, up: bool, *, profile: str = "", port: int = 0) -> None:
        with self._lock:
            self._get(instance_id, profile=profile, port=port).up = 1 if up else 0

    def observe_latency(self, instance_id: str, latency_ms: float, *, profile: str = "", port: int = 0) -> None:
        with self._lock:
            self._get(instance_id, profile=profile, port=port).health_latency_ms = latency_ms

    def inc_restart(self, instance_id: str, *, profile: str = "", port: int = 0) -> None:
        with self._lock:
            self._get(instance_id, profile=profile, port=port).restart_total += 1

    def inc_crash(self, instance_id: str, *, profile: str = "", port: int = 0) -> None:
        with self._lock:
            self._get(instance_id, profile=profile, port=port).crash_total += 1

    def inc_auth_failure(self, instance_id: str, *, profile: str = "", port: int = 0) -> None:
        with self._lock:
            self._get(instance_id, profile=profile, port=port).auth_failure_total += 1

    def inc_port_conflict(self, instance_id: str, *, profile: str = "", port: int = 0) -> None:
        with self._lock:
            self._get(instance_id, profile=profile, port=port).port_conflict_total += 1

    def snapshot(self) -> dict[str, dict]:
        with self._lock:
            out: dict[str, dict] = {}
            for iid, m in self._by_instance.items():
                out[iid] = {
                    "hermes_gateway_up": m.up,
                    "hermes_gateway_health_latency_ms": m.health_latency_ms,
                    "hermes_gateway_restart_total": m.restart_total,
                    "hermes_gateway_crash_total": m.crash_total,
                    "hermes_gateway_auth_failure_total": m.auth_failure_total,
                    "hermes_gateway_port_conflict_total": m.port_conflict_total,
                    "labels": dict(self._labels.get(iid, {})),
                }
            return out


SUPERVISOR_METRICS = HermesSupervisorMetrics()
