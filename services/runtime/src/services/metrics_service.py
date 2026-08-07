"""In-memory runtime metrics (PRD FR-902)."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any


@dataclass
class _Counter:
    value: int = 0

    def inc(self, amount: int = 1) -> None:
        self.value += amount


@dataclass
class _Gauge:
    value: float = 0.0

    def set(self, value: float) -> None:
        self.value = value


# @lat: [[runtime-service#Metrics]]
class MetricsService:
    _instance: MetricsService | None = None

    def __init__(self) -> None:
        self._start_time = time.monotonic()
        self._counters: dict[str, _Counter] = {
            "runtime_worker_failures_total": _Counter(),
            "runtime_task_failures_total": _Counter(),
            "runtime_artifact_upload_failures_total": _Counter(),
        }
        self._gauges: dict[str, _Gauge] = {
            "runtime_worker_healthy": _Gauge(1.0),
            "runtime_sync_lag_seconds": _Gauge(0.0),
            "runtime_inbox_pending": _Gauge(0.0),
            "runtime_outbox_pending": _Gauge(0.0),
            "runtime_outbox_dead_letter": _Gauge(0.0),
            "runtime_task_running": _Gauge(0.0),
            "runtime_task_waiting_approval": _Gauge(0.0),
            "runtime_gateway_health": _Gauge(1.0),
            "runtime_resource_revision": _Gauge(0.0),
            "runtime_artifact_upload_bytes": _Gauge(0.0),
        }
        self._histograms: dict[str, list[float]] = {
            "runtime_task_duration_seconds": [],
        }

    @classmethod
    def get(cls) -> MetricsService:
        if cls._instance is None:
            cls._instance = MetricsService()
        return cls._instance

    def counter_inc(self, name: str, amount: int = 1) -> None:
        if name not in self._counters:
            self._counters[name] = _Counter()
        self._counters[name].inc(amount)

    def gauge_set(self, name: str, value: float) -> None:
        if name not in self._gauges:
            self._gauges[name] = _Gauge()
        self._gauges[name].set(value)

    def observe_duration(self, name: str, seconds: float) -> None:
        if name not in self._histograms:
            self._histograms[name] = []
        self._histograms[name].append(seconds)
        if len(self._histograms[name]) > 1000:
            self._histograms[name] = self._histograms[name][-500:]

    def uptime_seconds(self) -> float:
        return time.monotonic() - self._start_time

    def export_prometheus(self) -> str:
        lines: list[str] = []
        lines.append(f"runtime_uptime_seconds {self.uptime_seconds():.3f}")
        for name, counter in self._counters.items():
            lines.append(f"{name} {counter.value}")
        for name, gauge in self._gauges.items():
            lines.append(f"{name} {gauge.value:.3f}")
        for name, values in self._histograms.items():
            if values:
                lines.append(f"{name}_count {len(values)}")
                lines.append(f"{name}_sum {sum(values):.3f}")
        return "\n".join(lines) + "\n"

    def export_json(self) -> dict[str, Any]:
        return {
            "runtime_uptime_seconds": self.uptime_seconds(),
            "counters": {k: v.value for k, v in self._counters.items()},
            "gauges": {k: v.value for k, v in self._gauges.items()},
            "histograms": {k: {"count": len(v), "sum": sum(v)} for k, v in self._histograms.items()},
        }
