"""Centralized Gateway ownership inspection (PRD v1.5.1 + v1.5.2 SOT)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import psutil

from core.config import Settings
from core.logging import get_logger
from core.runtime_enums import GatewayProcessState, OwnershipState
from db.models.runtime import HermesInstance
from integrations.hermes.client import GatewayHealthResult, HermesGatewayClient
from runtime.gateway_command_hash import (
    GATEWAY_FINGERPRINT_VERSION_LEGACY,
    compute_gateway_command_hash,
)
from runtime.gateway_listener import verify_lineage
from runtime.gateway_process import (
    find_pids_listening_on_port,
    is_pid_alive,
    verify_ownership,
)
from runtime.port_allocator import is_port_available

logger = get_logger(__name__)


@dataclass(frozen=True)
class SafeAdoptionEvidence:
    """PRD v1.5.2 §31 Safe Adoption Evidence v2."""

    port_match: bool = False
    gateway_command_match: bool = False
    profile_match: bool = False
    authenticated_health: bool = False
    hermes_environment_match: bool = False
    launcher_listener_lineage_match: bool | None = None
    runtime_version_compatible: bool = False
    # Legacy aliases retained for older callers/tests.
    executable_match: bool = False
    command_match: bool = False
    health_authenticated: bool = False
    runtime_version_match: bool = False

    @property
    def all_required(self) -> bool:
        return all(
            (
                self.port_match,
                self.gateway_command_match or self.command_match,
                self.profile_match,
                self.authenticated_health or self.health_authenticated,
                self.hermes_environment_match or self.executable_match or self.runtime_version_compatible,
                self.runtime_version_compatible or self.runtime_version_match,
            )
        )


@dataclass(frozen=True)
class GatewayOwnershipResult:
    state: OwnershipState
    process_state: GatewayProcessState = GatewayProcessState.UNKNOWN
    pid: int | None = None  # listener pid (authoritative)
    launcher_pid: int | None = None
    listener_pid: int | None = None
    listener_alive: bool = False
    process_alive: bool = False
    create_time_match: bool = False
    executable_match: bool = False
    port_owned_by_process: bool = False
    port_match: bool = False
    lineage_match: bool | None = None
    command_match: bool = False
    profile_match: bool = False
    health_authenticated: bool = False
    safe_to_adopt: bool = False
    reason: str | None = None
    evidence: SafeAdoptionEvidence | None = None
    health: GatewayHealthResult | None = None
    listening_pids: tuple[int, ...] = ()
    fingerprint_version: int | None = None
    upgrade_to_v2: bool = False

    @property
    def owned_or_adopted(self) -> bool:
        return self.state in (OwnershipState.OWNED, OwnershipState.ADOPTED)

    @property
    def owned(self) -> bool:
        """Compatibility with OwnershipResult.owned — only true OWNED."""
        return self.state == OwnershipState.OWNED


def _optional_int(value: object) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    return None


def _optional_float(value: object) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return None


def is_development_mode(settings: Settings) -> bool:
    """Map PRD deployment_mode=development → development_stub."""
    return (settings.deployment_mode or "").strip().lower() == "development_stub"


def safe_adoption_enabled(settings: Settings) -> bool:
    if settings.gateway_safe_adoption_enabled:
        return True
    return is_development_mode(settings) and bool(settings.gateway_dev_allow_safe_adoption)


def _derive_process_state(
    ownership: OwnershipState,
    *,
    listener_alive: bool,
) -> GatewayProcessState:
    """PRD §37–39 — not-owned ≠ exited."""
    if ownership == OwnershipState.STALE:
        return GatewayProcessState.EXITED
    if ownership == OwnershipState.FOREIGN:
        return GatewayProcessState.FOREIGN
    if ownership == OwnershipState.CONFLICT:
        return GatewayProcessState.ALIVE if listener_alive else GatewayProcessState.UNKNOWN
    if ownership in (OwnershipState.OWNED, OwnershipState.ADOPTED):
        return GatewayProcessState.ALIVE if listener_alive else GatewayProcessState.EXITED
    if listener_alive:
        return GatewayProcessState.ALIVE
    return GatewayProcessState.UNKNOWN


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

    def _env_hint(self, pid: int) -> dict[str, str] | None:
        try:
            return dict(psutil.Process(pid).environ())
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.Error):
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
        joined = " ".join(cmdline).lower()
        name = (profile_name or "").strip().lower()
        if not name:
            return True
        return name in joined or "hermes" in joined

    def _hermes_environment_match(self, pid: int, profile_name: str) -> bool:
        env = self._env_hint(pid)
        if not env:
            # AccessDenied — treat as unknown/weak match via cmdline instead.
            return self._profile_in_command(self._cmdline(pid), profile_name)
        home = (env.get("HERMES_HOME") or "").lower()
        name = (profile_name or "").strip().lower()
        if "hermes" in home:
            if not name or name == "default":
                return True
            return name in home
        return "API_SERVER_ENABLED" in env or "HERMES_GATEWAY_PORT" in env

    def _exe_compatible(self, live_exe: str | None, expected_launcher: str | None) -> bool:
        """PRD §32–34 — do not require listener exe == launcher exe."""
        if not live_exe:
            return False
        name = Path(live_exe).name.lower()
        # python.exe alone is never enough; must combine with other evidence.
        if "hermes" in name:
            return True
        if expected_launcher:
            try:
                if Path(live_exe).resolve() == Path(expected_launcher).resolve():
                    return True
            except OSError:
                pass
        # Listener may be python — compatible only as weak signal for lineage/cmd path.
        return "python" in name

    def _listener_pid_for(self, inst: HermesInstance) -> int | None:
        return _optional_int(getattr(inst, "gateway_listener_pid", None)) or _optional_int(
            getattr(inst, "pid", None)
        )

    def _listener_create_time_for(self, inst: HermesInstance) -> float | None:
        return _optional_float(getattr(inst, "gateway_listener_create_time", None)) or _optional_float(
            getattr(inst, "process_create_time", None)
        )

    def _fingerprint_version(self, inst: HermesInstance) -> int:
        ver = _optional_int(getattr(inst, "gateway_fingerprint_version", 1))
        return ver if ver is not None else 1

    async def _probe_health(
        self,
        port: int,
        api_key: str | None,
        *,
        probe: bool,
    ) -> tuple[GatewayHealthResult | None, bool]:
        if not probe:
            return None, False
        health = await HermesGatewayClient(port, api_key=api_key).health_check()
        return health, bool(health.healthy and health.authenticated)

    async def inspect(
        self,
        inst: HermesInstance,
        *,
        expected_executable: str | None = None,
        api_key: str | None = None,
        probe_health: bool = True,
        tracked_alive: bool = False,
    ) -> GatewayOwnershipResult:
        """Inspect ownership — sole SOT (PRD v1.5.2 §22–29). Never derive owned from /health alone."""
        expected_exe = expected_executable or getattr(inst, "gateway_executable_path", None)
        if expected_exe is not None and not isinstance(expected_exe, str):
            expected_exe = None
        listeners = find_pids_listening_on_port(inst.gateway_port)
        port_free = is_port_available("127.0.0.1", inst.gateway_port)
        fp_ver = self._fingerprint_version(inst)
        launcher_pid = _optional_int(getattr(inst, "gateway_launcher_pid", None))
        stored_listener = _optional_int(getattr(inst, "gateway_listener_pid", None))
        listener_ct = _optional_float(getattr(inst, "gateway_listener_create_time", None))
        legacy_pid = _optional_int(getattr(inst, "pid", None))
        legacy_ct = _optional_float(getattr(inst, "process_create_time", None))

        # --- Path 1: Listener fingerprint (v2) ---
        if stored_listener is not None and listener_ct is not None:
            return await self._inspect_listener_fingerprint(
                inst,
                listener_pid=stored_listener,
                listener_ct=listener_ct,
                launcher_pid=launcher_pid,
                expected_exe=expected_exe,
                api_key=api_key,
                probe_health=probe_health,
                tracked_alive=tracked_alive,
                listeners=listeners,
                fingerprint_version=fp_ver,
            )

        # --- Path 2: Legacy fingerprint (v1 / pid only) — upgrade path ---
        if legacy_pid is not None and legacy_ct is not None:
            return await self._inspect_legacy_fingerprint(
                inst,
                expected_exe=expected_exe,
                api_key=api_key,
                probe_health=probe_health,
                tracked_alive=tracked_alive,
                listeners=listeners,
                port_free=port_free,
                fingerprint_version=fp_ver,
            )

        # --- Path 3/4: No fingerprint — Safe Adoption or conflict ---
        return await self._inspect_orphan_or_conflict(
            inst,
            expected_exe=expected_exe,
            api_key=api_key,
            probe_health=probe_health,
            listeners=listeners,
            port_free=port_free,
            launcher_pid=launcher_pid,
        )

    async def _inspect_listener_fingerprint(
        self,
        inst: HermesInstance,
        *,
        listener_pid: int,
        listener_ct: float,
        launcher_pid: int | None,
        expected_exe: str | None,
        api_key: str | None,
        probe_health: bool,
        tracked_alive: bool,
        listeners: list[int],
        fingerprint_version: int,
    ) -> GatewayOwnershipResult:
        base = verify_ownership(
            pid=listener_pid,
            process_create_time=listener_ct,
            gateway_port=inst.gateway_port,
            instance_id=inst.id,
            expected_executable=None,  # listener may be python; do not force launcher exe
        )
        alive = is_pid_alive(listener_pid)
        port_ok = bool(listeners) and listener_pid in listeners
        cmdline = self._cmdline(listener_pid) if alive else None
        live_exe = self._exe(listener_pid) if alive else None
        cmd_ok = self._looks_like_gateway_command(cmdline)
        profile_ok = self._profile_in_command(cmdline, inst.profile_name)
        exe_ok = self._exe_compatible(live_exe, expected_exe)
        lineage: bool | None = None
        if launcher_pid is not None and alive:
            lineage = verify_lineage(launcher_pid, listener_pid)

        health, health_ok = await self._probe_health(
            inst.gateway_port, api_key, probe=probe_health and (port_ok or tracked_alive or alive)
        )

        if base.state == OwnershipState.STALE:
            return GatewayOwnershipResult(
                state=OwnershipState.STALE,
                process_state=GatewayProcessState.EXITED,
                pid=listener_pid,
                launcher_pid=launcher_pid,
                listener_pid=listener_pid,
                listener_alive=alive,
                process_alive=alive,
                reason=base.detail or "stale listener fingerprint",
                listening_pids=tuple(listeners),
                health=health,
                fingerprint_version=fingerprint_version,
                lineage_match=lineage,
            )

        if base.state == OwnershipState.FOREIGN:
            # Port owned by other PID while stored listener exists elsewhere.
            return GatewayOwnershipResult(
                state=OwnershipState.FOREIGN if not port_ok else OwnershipState.CONFLICT,
                process_state=_derive_process_state(
                    OwnershipState.FOREIGN if not port_ok else OwnershipState.CONFLICT,
                    listener_alive=alive or bool(listeners),
                ),
                pid=listener_pid,
                launcher_pid=launcher_pid,
                listener_pid=listener_pid,
                listener_alive=alive,
                process_alive=alive or bool(listeners),
                port_owned_by_process=port_ok,
                port_match=port_ok,
                reason=base.detail,
                listening_pids=tuple(listeners),
                health=health,
                fingerprint_version=fingerprint_version,
                lineage_match=lineage,
            )

        if base.state == OwnershipState.UNKNOWN:
            return GatewayOwnershipResult(
                state=OwnershipState.UNKNOWN,
                process_state=_derive_process_state(OwnershipState.UNKNOWN, listener_alive=alive),
                pid=listener_pid,
                launcher_pid=launcher_pid,
                listener_pid=listener_pid,
                listener_alive=alive,
                process_alive=alive,
                create_time_match=True,
                executable_match=exe_ok,
                port_owned_by_process=port_ok,
                port_match=port_ok,
                command_match=cmd_ok,
                profile_match=profile_ok,
                health_authenticated=health_ok,
                reason=base.detail or "insufficient process evidence",
                listening_pids=tuple(listeners),
                health=health,
                fingerprint_version=fingerprint_version,
                lineage_match=lineage,
            )

        # Valid listener fingerprint — launcher may be dead (PRD §28).
        state = OwnershipState.OWNED if tracked_alive else OwnershipState.ADOPTED
        logger.info(
            "gateway.ownership.inspect",
            instance_id=inst.id,
            state=state.value,
            listener_pid=listener_pid,
            launcher_pid=launcher_pid,
            health_ok=health_ok,
            source="listener-fingerprint",
        )
        return GatewayOwnershipResult(
            state=state,
            process_state=GatewayProcessState.ALIVE,
            pid=listener_pid,
            launcher_pid=launcher_pid,
            listener_pid=listener_pid,
            listener_alive=True,
            process_alive=True,
            create_time_match=True,
            executable_match=exe_ok or True,
            port_owned_by_process=port_ok or tracked_alive,
            port_match=port_ok or tracked_alive,
            lineage_match=lineage,
            command_match=cmd_ok or tracked_alive,
            profile_match=profile_ok or tracked_alive,
            health_authenticated=health_ok,
            reason="listener-fingerprint" if state == OwnershipState.ADOPTED else "tracked_handle",
            listening_pids=tuple(listeners),
            health=health,
            fingerprint_version=fingerprint_version,
        )

    async def _inspect_legacy_fingerprint(
        self,
        inst: HermesInstance,
        *,
        expected_exe: str | None,
        api_key: str | None,
        probe_health: bool,
        tracked_alive: bool,
        listeners: list[int],
        port_free: bool,
        fingerprint_version: int,
    ) -> GatewayOwnershipResult:
        """Legacy single-PID model — attempt listener rediscovery / upgrade (PRD §29)."""
        stored_pid = int(inst.pid)  # type: ignore[arg-type]
        stored_ct = float(inst.process_create_time)  # type: ignore[arg-type]

        # If stored pid is actually the listener, verify directly.
        base = verify_ownership(
            pid=stored_pid,
            process_create_time=stored_ct,
            gateway_port=inst.gateway_port,
            instance_id=inst.id,
            expected_executable=expected_exe,
        )
        health, health_ok = await self._probe_health(
            inst.gateway_port, api_key, probe=probe_health
        )

        if base.state == OwnershipState.STALE:
            # Stored launcher/legacy pid dead — try rediscover listener on port.
            if listeners and not port_free:
                return await self._try_legacy_upgrade(
                    inst,
                    listeners=listeners,
                    expected_exe=expected_exe,
                    health=health,
                    health_ok=health_ok,
                    tracked_alive=tracked_alive,
                )
            return GatewayOwnershipResult(
                state=OwnershipState.STALE,
                process_state=GatewayProcessState.EXITED,
                pid=stored_pid,
                launcher_pid=stored_pid,
                listener_alive=False,
                process_alive=False,
                reason=base.detail or "stale fingerprint",
                listening_pids=tuple(listeners),
                health=health,
                fingerprint_version=fingerprint_version,
            )

        if base.state == OwnershipState.FOREIGN:
            # Classic bug: stored launcher PID ≠ listener PID on port.
            # Attempt lineage-based upgrade when listeners exist.
            if listeners:
                upgraded = await self._try_legacy_upgrade(
                    inst,
                    listeners=listeners,
                    expected_exe=expected_exe,
                    health=health,
                    health_ok=health_ok,
                    tracked_alive=tracked_alive,
                    launcher_pid=stored_pid if is_pid_alive(stored_pid) else None,
                )
                if upgraded.owned_or_adopted or upgraded.upgrade_to_v2:
                    return upgraded
            return GatewayOwnershipResult(
                state=OwnershipState.CONFLICT,
                process_state=GatewayProcessState.ALIVE if listeners else GatewayProcessState.FOREIGN,
                pid=stored_pid,
                launcher_pid=stored_pid,
                listener_pid=listeners[0] if listeners else None,
                listener_alive=bool(listeners),
                process_alive=bool(listeners) or is_pid_alive(stored_pid),
                reason=base.detail or "GATEWAY_PORT_OWNERSHIP_CONFLICT",
                listening_pids=tuple(listeners),
                health=health,
                fingerprint_version=fingerprint_version,
            )

        if base.state == OwnershipState.UNKNOWN:
            return GatewayOwnershipResult(
                state=OwnershipState.UNKNOWN,
                process_state=_derive_process_state(
                    OwnershipState.UNKNOWN, listener_alive=is_pid_alive(stored_pid)
                ),
                pid=stored_pid,
                launcher_pid=getattr(inst, "gateway_launcher_pid", None) or stored_pid,
                listener_alive=is_pid_alive(stored_pid),
                process_alive=is_pid_alive(stored_pid),
                reason=base.detail or "insufficient process evidence",
                listening_pids=tuple(listeners),
                health=health,
                fingerprint_version=fingerprint_version,
            )

        # Owned under legacy model (same process).
        state = OwnershipState.OWNED if tracked_alive else OwnershipState.ADOPTED
        return GatewayOwnershipResult(
            state=state,
            process_state=GatewayProcessState.ALIVE,
            pid=stored_pid,
            launcher_pid=getattr(inst, "gateway_launcher_pid", None) or stored_pid,
            listener_pid=stored_pid,
            listener_alive=True,
            process_alive=True,
            create_time_match=True,
            port_owned_by_process=True,
            port_match=True,
            health_authenticated=health_ok,
            reason="legacy_fingerprint",
            listening_pids=tuple(listeners),
            health=health,
            fingerprint_version=fingerprint_version,
            upgrade_to_v2=fingerprint_version <= GATEWAY_FINGERPRINT_VERSION_LEGACY,
        )

    async def _try_legacy_upgrade(
        self,
        inst: HermesInstance,
        *,
        listeners: list[int],
        expected_exe: str | None,
        health: GatewayHealthResult | None,
        health_ok: bool,
        tracked_alive: bool,
        launcher_pid: int | None = None,
    ) -> GatewayOwnershipResult:
        """Rediscover listener and optionally upgrade fingerprint to v2."""
        launcher = launcher_pid or getattr(inst, "gateway_launcher_pid", None) or inst.pid
        candidate = None
        lineage_ok: bool | None = None
        for pid in listeners:
            if launcher is not None and is_pid_alive(int(launcher)) and verify_lineage(int(launcher), pid):
                candidate = pid
                lineage_ok = True
                break
        if candidate is None:
            # Development Safe Adoption may accept listener with full evidence.
            candidate = listeners[0]
            lineage_ok = False if launcher else None

        cmdline = self._cmdline(candidate)
        live_exe = self._exe(candidate)
        cmd_ok = self._looks_like_gateway_command(cmdline)
        profile_ok = self._profile_in_command(cmdline, inst.profile_name)
        env_ok = self._hermes_environment_match(candidate, inst.profile_name)
        exe_compat = self._exe_compatible(live_exe, expected_exe)
        runtime_compat = bool(lineage_ok) or (cmd_ok and env_ok)

        evidence = SafeAdoptionEvidence(
            port_match=True,
            gateway_command_match=cmd_ok,
            profile_match=profile_ok,
            authenticated_health=health_ok,
            hermes_environment_match=env_ok,
            launcher_listener_lineage_match=lineage_ok,
            runtime_version_compatible=runtime_compat,
            executable_match=exe_compat,
            command_match=cmd_ok,
            health_authenticated=health_ok,
            runtime_version_match=runtime_compat,
        )

        if lineage_ok and (health_ok or not health) and (cmd_ok or env_ok or tracked_alive):
            state = OwnershipState.OWNED if tracked_alive else OwnershipState.ADOPTED
            try:
                ct = float(psutil.Process(candidate).create_time())
            except Exception:
                ct = None
            return GatewayOwnershipResult(
                state=state,
                process_state=GatewayProcessState.ALIVE,
                pid=candidate,
                launcher_pid=int(launcher) if launcher else None,
                listener_pid=candidate,
                listener_alive=True,
                process_alive=True,
                create_time_match=ct is not None,
                executable_match=exe_compat,
                port_owned_by_process=True,
                port_match=True,
                lineage_match=True,
                command_match=cmd_ok,
                profile_match=profile_ok,
                health_authenticated=health_ok,
                reason="legacy_lineage_upgrade",
                evidence=evidence,
                listening_pids=tuple(listeners),
                health=health,
                fingerprint_version=2,
                upgrade_to_v2=True,
            )

        if evidence.all_required and safe_adoption_enabled(self._settings):
            return GatewayOwnershipResult(
                state=OwnershipState.ADOPTED,
                process_state=GatewayProcessState.ALIVE,
                pid=candidate,
                launcher_pid=int(launcher) if launcher else None,
                listener_pid=candidate,
                listener_alive=True,
                process_alive=True,
                port_owned_by_process=True,
                port_match=True,
                lineage_match=lineage_ok,
                command_match=True,
                profile_match=True,
                health_authenticated=True,
                safe_to_adopt=True,
                reason="verified_orphan",
                evidence=evidence,
                listening_pids=tuple(listeners),
                health=health,
                fingerprint_version=2,
                upgrade_to_v2=True,
            )

        # Production / insufficient evidence → conflict (do not kill).
        return GatewayOwnershipResult(
            state=OwnershipState.CONFLICT,
            process_state=GatewayProcessState.ALIVE,
            pid=candidate,
            launcher_pid=int(launcher) if launcher else None,
            listener_pid=candidate,
            listener_alive=True,
            process_alive=True,
            port_owned_by_process=True,
            port_match=True,
            lineage_match=lineage_ok,
            command_match=cmd_ok,
            profile_match=profile_ok,
            health_authenticated=health_ok,
            reason="GATEWAY_PORT_OWNERSHIP_CONFLICT",
            evidence=evidence,
            listening_pids=tuple(listeners),
            health=health,
        )

    async def _inspect_orphan_or_conflict(
        self,
        inst: HermesInstance,
        *,
        expected_exe: str | None,
        api_key: str | None,
        probe_health: bool,
        listeners: list[int],
        port_free: bool,
        launcher_pid: int | None,
    ) -> GatewayOwnershipResult:
        if port_free:
            return GatewayOwnershipResult(
                state=OwnershipState.UNKNOWN,
                process_state=GatewayProcessState.MISSING,
                reason="no fingerprint; port free",
                listening_pids=(),
            )

        if not listeners:
            return GatewayOwnershipResult(
                state=OwnershipState.CONFLICT,
                process_state=GatewayProcessState.UNKNOWN,
                reason="port busy but listener pid unknown",
                listening_pids=(),
            )

        listener_pid = listeners[0]
        cmdline = self._cmdline(listener_pid)
        live_exe = self._exe(listener_pid)
        cmd_ok = self._looks_like_gateway_command(cmdline)
        profile_ok = self._profile_in_command(cmdline, inst.profile_name)
        env_ok = self._hermes_environment_match(listener_pid, inst.profile_name)
        exe_compat = self._exe_compatible(live_exe, expected_exe)
        lineage: bool | None = None
        if launcher_pid is not None and is_pid_alive(launcher_pid):
            lineage = verify_lineage(launcher_pid, listener_pid)

        health, health_ok = await self._probe_health(
            inst.gateway_port, api_key, probe=probe_health
        )

        cmd_hash_ok = False
        if expected_exe and getattr(inst, "gateway_command_hash", None):
            live_hash = compute_gateway_command_hash(
                executable=expected_exe,
                profile_name=inst.profile_name,
                port=inst.gateway_port,
                command=cmdline,
            )
            cmd_hash_ok = live_hash == inst.gateway_command_hash

        runtime_compat = bool(lineage) or (cmd_ok and env_ok) or (cmd_hash_ok and env_ok)
        evidence = SafeAdoptionEvidence(
            port_match=True,
            gateway_command_match=cmd_ok or cmd_hash_ok,
            profile_match=profile_ok,
            authenticated_health=health_ok,
            hermes_environment_match=env_ok,
            launcher_listener_lineage_match=lineage,
            runtime_version_compatible=runtime_compat,
            executable_match=exe_compat,
            command_match=cmd_ok or cmd_hash_ok,
            health_authenticated=health_ok,
            runtime_version_match=runtime_compat,
        )

        if evidence.all_required and safe_adoption_enabled(self._settings):
            return GatewayOwnershipResult(
                state=OwnershipState.ADOPTED,
                process_state=GatewayProcessState.ALIVE,
                pid=listener_pid,
                launcher_pid=launcher_pid,
                listener_pid=listener_pid,
                listener_alive=True,
                process_alive=True,
                port_owned_by_process=True,
                port_match=True,
                lineage_match=lineage,
                command_match=True,
                profile_match=True,
                health_authenticated=True,
                safe_to_adopt=True,
                reason="verified_orphan",
                evidence=evidence,
                listening_pids=tuple(listeners),
                health=health,
                fingerprint_version=2,
                upgrade_to_v2=True,
            )

        if not cmd_ok and not exe_compat and not env_ok:
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
        )
        return GatewayOwnershipResult(
            state=state,
            process_state=_derive_process_state(state, listener_alive=True),
            pid=listener_pid,
            launcher_pid=launcher_pid,
            listener_pid=listener_pid,
            listener_alive=True,
            process_alive=True,
            executable_match=exe_compat,
            port_owned_by_process=True,
            port_match=True,
            lineage_match=lineage,
            command_match=cmd_ok,
            profile_match=profile_ok,
            health_authenticated=health_ok,
            safe_to_adopt=False,
            reason=reason,
            evidence=evidence,
            listening_pids=tuple(listeners),
            health=health,
        )
