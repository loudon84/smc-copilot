"""Per-host circuit breaker (PRD v1.6 FR-104)."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import StrEnum


class CircuitState(StrEnum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitOpenError(RuntimeError):
    def __init__(self, host: str, open_until: float) -> None:
        super().__init__(f"circuit open for {host} until {open_until}")
        self.host = host
        self.open_until = open_until
        self.code = "circuit_open"


@dataclass
class HostCircuit:
    state: CircuitState = CircuitState.CLOSED
    consecutive_failures: int = 0
    last_success_at: float | None = None
    last_error: str | None = None
    open_until: float = 0.0
    half_open_probe_in_flight: bool = False


@dataclass
class CircuitBreaker:
    failure_threshold: int = 5
    open_seconds: float = 30.0
    hosts: dict[str, HostCircuit] = field(default_factory=dict)

    def _host(self, host: str) -> HostCircuit:
        if host not in self.hosts:
            self.hosts[host] = HostCircuit()
        return self.hosts[host]

    def before_call(self, host: str) -> None:
        hc = self._host(host)
        now = time.time()
        if hc.state == CircuitState.OPEN:
            if now >= hc.open_until:
                hc.state = CircuitState.HALF_OPEN
                hc.half_open_probe_in_flight = False
            else:
                raise CircuitOpenError(host, hc.open_until)
        if hc.state == CircuitState.HALF_OPEN:
            if hc.half_open_probe_in_flight:
                raise CircuitOpenError(host, hc.open_until)
            hc.half_open_probe_in_flight = True

    def record_success(self, host: str) -> None:
        hc = self._host(host)
        hc.state = CircuitState.CLOSED
        hc.consecutive_failures = 0
        hc.last_success_at = time.time()
        hc.last_error = None
        hc.half_open_probe_in_flight = False
        hc.open_until = 0.0

    def record_failure(self, host: str, *, error: str | None = None) -> None:
        hc = self._host(host)
        hc.consecutive_failures += 1
        hc.last_error = error
        hc.half_open_probe_in_flight = False
        if hc.state == CircuitState.HALF_OPEN or hc.consecutive_failures >= self.failure_threshold:
            hc.state = CircuitState.OPEN
            hc.open_until = time.time() + self.open_seconds

    def snapshot(self) -> dict[str, dict[str, object]]:
        out: dict[str, dict[str, object]] = {}
        for host, hc in self.hosts.items():
            out[host] = {
                "state": hc.state.value,
                "consecutiveFailures": hc.consecutive_failures,
                "lastSuccessAt": hc.last_success_at,
                "lastError": hc.last_error,
                "openUntil": hc.open_until or None,
            }
        return out
