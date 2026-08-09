"""Centralized Gateway ownership inspection (PRD v1.5.1 §10–16, §58)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import psutil

from core.config import Settings
from core.logging import get_logger
from core.runtime_enums import OwnershipState
from db.models.runtime import HermesInstance
from integrations.hermes.client import GatewayHealthResult, HermesGatewayClient
from runtime.gateway_command_hash import compute_gateway_command_hash
from runtime.gateway_process import (
    find_pids_listening_on_port,
    is_pid_alive,
    verify_ownership,
)
from runtime.port_allocator import is_port_available

logger = get_logger(__name__)


@dataclass(frozen=True)
class SafeAdoptionEvidence:
    executable_match: bool = False
    command_match: bool = False
    profile_match: bool = False
    port_match: bool = False
    health_authenticated: bool = False
    runtime_version_match: bool = False

    @property
    def all_required(self) -> bool:
        return all(
            (
                self.executable_match,
                self.command_match,
                self.profile_match,
                self.port_match,
                self.health_authenticated,
                self.runtime_version_match,
            )
        )


@dataclass(frozen=True)
class GatewayOwnershipResult:
    state: OwnershipState
    pid: int | None = None
    process_alive: bool = False
    create_time_match: bool = False
    executable_match: bool = False
    port_owned_by_process: bool = False
    command_match: bool = False
    profile_match: bool = False
    health_authenticated: bool = False
    safe_to_adopt: bool = False
    reason: str | None = None
    evidence: SafeAdoptionEvidence | None = None
    health: GatewayHealthResult | None = None
    listening_pids: tuple[int, ...] = ()

    @property
    def owned_or_adopted(self) -> bool:
        return self.state in (OwnershipState.OWNED, OwnershipState.ADOPTED)


def is_development_mode(settings: Settings) -> bool:
    """Map PRD deployment_mode=development → development_stub."""
    return (settings.deployment_mode or "").strip().lower() == "development_stub"


def safe_adoption_enabled(settings: Settings) -> bool:
    if settings.gateway_safe_adoption_enabled:
        return True
    return is_development_mode(settings) and bool(settings.gateway_dev_allow_safe_adoption)


class GatewayOwnershipService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def _cmdline(self, pid: int) -> list[str] | None:
        try:
            return list(psutil.Process(pid).cmdline())
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.Error):
            return None

    def _exe(self, pid: int) -> str | None:
        try:
            return psutil.Process(pid).exe()
        except (psutil.AccessDenied, psutil.Error):
            return None
        except psutil.NoSuchProcess:
            return None

    def _looks_like_gateway_command(self, cmdline: list[str] | None) -> bool:
        if not cmdline:
            return False
        joined = " ".join(cmdline).lower()
        return "gateway" in joined and (
            "run" in joined or "--external-supervisor" in joined or "external-supervisor" in joined
        )

    def _profile_in_command(self, cmdline: list[str] | None, profile_name: str) -> bool:
        if not cmdline:
            return False
        # Hermes uses HERMES_HOME / cwd rather than --profile; accept profile token or hermes path.
        joined = " ".join(cmdline).lower()
        name = (profile_name or "").strip().lower()
        if not name:
            return True
        return name in joined or "hermes" in joined

    def _exe_matches(self, live_exe: str | None, expected: str | None) -> bool:
        if not expected:
            return False
        if not live_exe:
            return False
        try:
            a = Path(live_exe).resolve()
            b = Path(expected).resolve()
        except OSError:
            a = Path(live_exe)
            b = Path(expected)
        if a == b:
            return True
        return a.name.lower() == b.name.lower() and (
            "hermes" in a.name.lower() or "python" in a.name.lower()
        )

    async def inspect(
        self,
        inst: HermesInstance,
        *,
        expected_executable: str | None = None,
        api_key: str | None = None,
        probe_health: bool = True,
        tracked_alive: bool = False,
    ) -> GatewayOwnershipResult:
        """Inspect ownership for an Instance. Never derives owned solely from /health."""
        expected_exe = expected_executable or getattr(inst, "gateway_executable_path", None)
        listeners = find_pids_listening_on_port(inst.gateway_port)
        port_free = is_port_available("127.0.0.1", inst.gateway_port)

        # Prefer stored fingerprint verification first.
        if inst.pid is not None and inst.process_create_time is not None:
            base = verify_ownership(
                pid=inst.pid,
                process_create_time=inst.process_create_time,
                gateway_port=inst.gateway_port,
                instance_id=inst.id,
                expected_executable=expected_exe,
            )
            cmdline = self._cmdline(inst.pid) if is_pid_alive(inst.pid) else None
            live_exe = self._exe(inst.pid) if is_pid_alive(inst.pid) else None
            cmd_ok = self._looks_like_gateway_command(cmdline)
            profile_ok = self._profile_in_command(cmdline, inst.profile_name)
            exe_ok = self._exe_matches(live_exe, expected_exe) if expected_exe else bool(live_exe)
            port_ok = bool(listeners) and inst.pid in listeners

            health: GatewayHealthResult | None = None
            health_ok = False
            if probe_health and base.owned and (port_ok or tracked_alive):
                health = await HermesGatewayClient(inst.gateway_port, api_key=api_key).health_check()
                health_ok = bool(health.healthy and health.authenticated)

            if base.state == OwnershipState.STALE:
                logger.info(
                    "gateway.ownership.stale",
                    instance_id=inst.id,
                    pid=inst.pid,
                    detail=base.detail,
                )
                return GatewayOwnershipResult(
                    state=OwnershipState.STALE,
                    pid=inst.pid,
                    process_alive=is_pid_alive(inst.pid),
                    reason=base.detail or "stale fingerprint",
                    listening_pids=tuple(listeners),
                    health=health,
                )

            if base.state == OwnershipState.FOREIGN:
                return GatewayOwnershipResult(
                    state=OwnershipState.FOREIGN,
                    pid=inst.pid,
                    process_alive=is_pid_alive(inst.pid),
                    reason=base.detail,
                    listening_pids=tuple(listeners),
                    health=health,
                )

            if base.state == OwnershipState.UNKNOWN:
                # AccessDenied / incomplete — never auto-foreign
                return GatewayOwnershipResult(
                    state=OwnershipState.UNKNOWN,
                    pid=inst.pid,
                    process_alive=is_pid_alive(inst.pid),
                    create_time_match=True,
                    executable_match=exe_ok,
                    port_owned_by_process=port_ok,
                    command_match=cmd_ok,
                    profile_match=profile_ok,
                    health_authenticated=health_ok,
                    reason=base.detail or "insufficient process evidence",
                    listening_pids=tuple(listeners),
                    health=health,
                )

            # Owned fingerprint (create_time + pid). Distinguish live handle vs adopted.
            state = OwnershipState.OWNED if tracked_alive else OwnershipState.ADOPTED
            if not health_ok and probe_health and health is not None and not health.healthy:
                # Fingerprint valid but API not healthy — still owned/adopted process-wise
                pass
            logger.info(
                "gateway.ownership.inspect",
                instance_id=inst.id,
                state=state.value,
                pid=inst.pid,
                health_ok=health_ok,
            )
            return GatewayOwnershipResult(
                state=state,
                pid=inst.pid,
                process_alive=True,
                create_time_match=True,
                executable_match=exe_ok or base.owned,
                port_owned_by_process=port_ok or tracked_alive,
                command_match=cmd_ok or tracked_alive,
                profile_match=profile_ok or tracked_alive,
                health_authenticated=health_ok,
                reason="persistent_fingerprint" if state == OwnershipState.ADOPTED else "tracked_handle",
                listening_pids=tuple(listeners),
                health=health,
            )

        # No stored fingerprint — evaluate port listeners for Safe Adoption / conflict.
        if port_free:
            return GatewayOwnershipResult(
                state=OwnershipState.UNKNOWN,
                reason="no fingerprint; port free",
                listening_pids=(),
            )

        if not listeners:
            return GatewayOwnershipResult(
                state=OwnershipState.CONFLICT,
                reason="port busy but listener pid unknown",
                listening_pids=(),
            )

        # Evaluate first listener for Safe Adoption evidence (never health-alone).
        listener_pid = listeners[0]
        cmdline = self._cmdline(listener_pid)
        live_exe = self._exe(listener_pid)
        cmd_ok = self._looks_like_gateway_command(cmdline)
        profile_ok = self._profile_in_command(cmdline, inst.profile_name)
        exe_ok = self._exe_matches(live_exe, expected_exe)
        port_ok = True

        health = None
        health_ok = False
        if probe_health:
            health = await HermesGatewayClient(inst.gateway_port, api_key=api_key).health_check()
            health_ok = bool(health.healthy and health.authenticated)

        # Command hash match when we have stored hash + expected exe
        cmd_hash_ok = False
        if expected_exe and getattr(inst, "gateway_command_hash", None):
            live_hash = compute_gateway_command_hash(
                executable=expected_exe,
                profile_name=inst.profile_name,
                port=inst.gateway_port,
                command=cmdline,
            )
            cmd_hash_ok = live_hash == inst.gateway_command_hash

        evidence = SafeAdoptionEvidence(
            executable_match=exe_ok,
            command_match=cmd_ok or cmd_hash_ok,
            profile_match=profile_ok,
            port_match=port_ok,
            health_authenticated=health_ok,
            runtime_version_match=exe_ok,  # active RuntimeVersion executable match
        )

        # Health alone must never yield owned/adopted.
        if evidence.all_required and safe_adoption_enabled(self._settings):
            return GatewayOwnershipResult(
                state=OwnershipState.ADOPTED,
                pid=listener_pid,
                process_alive=True,
                create_time_match=False,
                executable_match=True,
                port_owned_by_process=True,
                command_match=True,
                profile_match=True,
                health_authenticated=True,
                safe_to_adopt=True,
                reason="verified_orphan",
                evidence=evidence,
                listening_pids=tuple(listeners),
                health=health,
            )

        # Foreign or conflict — do not kill.
        if not cmd_ok and not exe_ok:
            state = OwnershipState.FOREIGN
            reason = "listener is not a matching Hermes gateway"
        else:
            state = OwnershipState.CONFLICT
            reason = "GATEWAY_PORT_OWNERSHIP_CONFLICT"

        logger.warning(
            "gateway.ownership.conflict",
            instance_id=inst.id,
            pid=listener_pid,
            state=state.value,
            health_ok=health_ok,
            evidence=evidence.__dict__,
        )
        return GatewayOwnershipResult(
            state=state,
            pid=listener_pid,
            process_alive=True,
            executable_match=exe_ok,
            port_owned_by_process=port_ok,
            command_match=cmd_ok,
            profile_match=profile_ok,
            health_authenticated=health_ok,
            safe_to_adopt=False,
            reason=reason,
            evidence=evidence,
            listening_pids=tuple(listeners),
            health=health,
        )
