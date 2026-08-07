from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.logging import get_logger
from core.runtime_enums import RuntimeVersionStatus
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import HermesInstance, RuntimeJob
from db.repositories.runtime_repo import RuntimeVersionRepository
from integrations.hermes.client_factory import HermesGatewayClientFactory
from runtime.cancellation_token import CancellationToken, JobCancelled
from runtime.environment_probe import ActivationManager
from runtime.gateway_process import GatewayProcessManager
from services.compatibility_service import CompatibilityService
from services.installation_service import InstallationService
from services.instance_gateway_service import InstanceGatewayService
from services.runtime_update_plan_service import RuntimeUpdatePlanService
from services.runtime_version_pin_service import RuntimeVersionPinService

logger = get_logger(__name__)


# @lat: [[runtime-service#更新与回滚]]
class UpdateService:
    def __init__(self, settings: Settings, session_maker: async_sessionmaker[AsyncSession]) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._install = InstallationService(settings, session_maker)
        self._compat = CompatibilityService(settings)
        self._activation = ActivationManager(settings)
        self._plan_service = RuntimeUpdatePlanService(settings, session_maker)
        self._gateway = InstanceGatewayService(
            settings=settings,
            session_maker=session_maker,
            process_manager=GatewayProcessManager(settings),
        )

    async def run_job(
        self,
        job: RuntimeJob,
        request: dict[str, Any],
        progress,
        cancellation_token: CancellationToken | None = None,
    ) -> dict[str, Any]:
        token = cancellation_token or CancellationToken()
        instance_ids = request.get("instanceIds") or request.get("instance_ids")
        if instance_ids and not isinstance(instance_ids, list):
            instance_ids = None

        async with self._session_maker() as session:
            repo = RuntimeVersionRepository(session)
            previous = await repo.get_active()
            previous_version = previous.version if previous else None
            previous_id = previous.id if previous else None
            await session.commit()

        await progress("Checking compatibility", phase="compat", progress_value=0.1, event_type="job.phase_changed")
        target = str(request.get("version") or "latest")
        compat = self._compat.check(previous_version, target)
        if not compat["compatible"]:
            raise RuntimeServiceError(
                "Incompatible Hermes version",
                code="activation_failed",
                details=compat,
            )

        token.raise_if_cancelled()
        await progress("Installing new version", phase="install", progress_value=0.2, event_type="job.phase_changed")
        install_result: dict[str, Any] = {}
        new_version_id: str | None = None
        new_version_label: str | None = None
        original_bindings: dict[str, str | None] = {}

        try:
            install_result = await self._install.run_job(
                job,
                {**request, "createDefaultInstance": False},
                progress,
                cancellation_token=token,
            )
            new_version_label = str(install_result.get("resolvedVersion") or install_result.get("version") or target)

            async with self._session_maker() as session:
                repo = RuntimeVersionRepository(session)
                new_row = await repo.get_by_version(new_version_label)
                if new_row is None:
                    raise RuntimeServiceError(
                        f"Installed version not found: {new_version_label}",
                        code="not_found",
                    )
                new_version_id = new_row.id

                canary_id = await self._plan_service.pick_canary_instance_id(session, instance_ids)
                rollout_ids = await self._rollout_instance_ids(session, instance_ids, canary_id)

                result_inst = await session.execute(select(HermesInstance))
                for inst in result_inst.scalars().all():
                    original_bindings[inst.id] = inst.runtime_version_id

                await self._persist_rollback_state(
                    session,
                    job,
                    {
                        "previousVersionId": previous_id,
                        "previousVersion": previous_version,
                        "newVersionId": new_version_id,
                        "newVersion": new_version_label,
                        "originalBindings": original_bindings,
                        "reservedVersionIds": [v for v in {previous_id, new_version_id} if v],
                    },
                )
                await session.commit()

            if rollout_ids:
                await progress(
                    "Rolling out to instances",
                    phase="rollout",
                    progress_value=0.5,
                    event_type="job.phase_changed",
                )
                for idx, inst_id in enumerate(rollout_ids):
                    token.raise_if_cancelled()
                    label = "canary" if idx == 0 and canary_id == inst_id else "instance"
                    await progress(
                        f"Updating {label} {inst_id}",
                        phase="rollout",
                        progress_value=0.5 + 0.3 * (idx + 1) / max(len(rollout_ids), 1),
                    )
                    await self._rebind_and_restart(inst_id, new_version_id, token)

            token.raise_if_cancelled()
            await progress("Activating version", phase="activate", progress_value=0.9, event_type="job.phase_changed")
            async with self._session_maker() as session:
                repo = RuntimeVersionRepository(session)
                activated = await repo.set_active(new_version_id)
                if activated is None:
                    raise RuntimeServiceError("Failed to activate new version", code="activation_failed")
                self._activation.write_active_atomic(
                    {
                        "version": activated.version,
                        "versionId": activated.id,
                        "executablePath": activated.executable_path,
                    }
                )
                await session.commit()

            await self._cleanup_old_versions()
            install_result["previousVersion"] = previous_version
            install_result["compatibility"] = compat
            install_result["affectedInstances"] = rollout_ids
            return install_result
        except JobCancelled:
            await self._cleanup_staging_install(new_version_label)
            raise
        except Exception:
            await progress("Restoring after update failure", phase="restore", progress_value=0.5)
            await self._restore_after_failure(
                previous_id=previous_id,
                previous_version=previous_version,
                new_version_id=new_version_id,
                original_bindings=original_bindings,
                rollout_ids=list(original_bindings.keys()),
            )
            raise

    async def _rollout_instance_ids(
        self,
        session: AsyncSession,
        instance_ids: list[str] | None,
        canary_id: str | None,
    ) -> list[str]:
        if instance_ids:
            ids = list(instance_ids)
        else:
            result = await session.execute(select(HermesInstance))
            ids = [i.id for i in result.scalars().all()]
        if canary_id and canary_id in ids:
            ids.remove(canary_id)
            ids.insert(0, canary_id)
        return ids

    async def _rebind_and_restart(
        self,
        instance_id: str,
        version_id: str,
        token: CancellationToken,
    ) -> None:
        token.raise_if_cancelled()
        await self._gateway.stop_instance(instance_id)
        token.raise_if_cancelled()

        async with self._session_maker() as session:
            inst = await session.get(HermesInstance, instance_id)
            if inst is None:
                raise RuntimeServiceError(f"Instance not found: {instance_id}", code="not_found")
            inst.runtime_version_id = version_id
            await session.commit()

        token.raise_if_cancelled()
        await self._gateway.start_instance(instance_id)
        token.raise_if_cancelled()
        await self._probe_instance(instance_id)

    async def _probe_instance(self, instance_id: str) -> None:
        async with self._session_maker() as session:
            factory = HermesGatewayClientFactory(self._settings, session)
            client = await factory.create_for_instance(instance_id)
            if not await client.health_check():
                raise RuntimeServiceError(
                    f"Gateway health failed for instance {instance_id}",
                    code="gateway_health_failed",
                )
            await client.list_models()

    async def _persist_rollback_state(
        self,
        session: AsyncSession,
        job: RuntimeJob,
        state: dict[str, Any],
    ) -> None:
        job.rollback_state_json = json.dumps(state)

    async def _restore_after_failure(
        self,
        *,
        previous_id: str | None,
        previous_version: str | None,
        new_version_id: str | None,
        original_bindings: dict[str, str | None],
        rollout_ids: list[str],
    ) -> None:
        for inst_id in rollout_ids:
            old_vid = original_bindings.get(inst_id)
            try:
                await self._gateway.stop_instance(inst_id)
            except Exception as exc:
                logger.warning("restore_stop_failed", instance_id=inst_id, error=str(exc))
            if old_vid:
                async with self._session_maker() as session:
                    inst = await session.get(HermesInstance, inst_id)
                    if inst is not None:
                        inst.runtime_version_id = old_vid
                        await session.commit()

        if previous_id:
            async with self._session_maker() as session:
                repo = RuntimeVersionRepository(session)
                activated = await repo.set_active(previous_id)
                if activated is not None:
                    self._activation.write_active_atomic(
                        {
                            "version": activated.version,
                            "versionId": activated.id,
                            "executablePath": activated.executable_path,
                        }
                    )
                await session.commit()

        for inst_id in rollout_ids:
            try:
                await self._gateway.start_instance(inst_id)
            except Exception as exc:
                logger.warning("restore_start_failed", instance_id=inst_id, error=str(exc))

    async def _cleanup_staging_install(self, version_label: str | None) -> None:
        if not version_label:
            return
        async with self._session_maker() as session:
            repo = RuntimeVersionRepository(session)
            row = await repo.get_by_version(version_label)
            if row is None:
                return
            if row.status == RuntimeVersionStatus.ACTIVE.value:
                return
            path = Path(row.install_path)
            if path.exists():
                shutil.rmtree(path, ignore_errors=True)
            await repo.delete(row)
            await session.commit()

    async def _cleanup_old_versions(self) -> None:
        max_old = self._settings.runtime_max_old_versions
        async with self._session_maker() as session:
            repo = RuntimeVersionRepository(session)
            pin = RuntimeVersionPinService(session)
            versions = await repo.list_all()
            inactive = [v for v in versions if v.status == RuntimeVersionStatus.INACTIVE.value]
            inactive.sort(key=lambda v: v.installed_at or v.created_at, reverse=True)
            for stale in inactive[max_old:]:
                try:
                    reason = await pin.pin_reason(stale)
                    if reason:
                        logger.info("version_cleanup_skipped_pinned", version=stale.version, reason=reason)
                        continue
                    path = Path(stale.install_path)
                    if path.exists():
                        shutil.rmtree(path, ignore_errors=True)
                    await repo.delete(stale)
                except Exception as exc:
                    logger.warning("version_cleanup_failed", version=stale.version, error=str(exc))
            await session.commit()


# @lat: [[runtime-service#更新与回滚]]
class RollbackService:
    def __init__(self, settings: Settings, session_maker: async_sessionmaker[AsyncSession]) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._activation = ActivationManager(settings)
        self._gateway = InstanceGatewayService(
            settings=settings,
            session_maker=session_maker,
            process_manager=GatewayProcessManager(settings),
        )

    async def run_job(
        self,
        job: RuntimeJob,
        request: dict[str, Any],
        progress,
        cancellation_token: CancellationToken | None = None,
    ) -> dict[str, Any]:
        token = cancellation_token or CancellationToken()
        mode = str(request.get("mode") or "all")
        instance_ids = request.get("instanceIds") or request.get("instance_ids")
        if instance_ids and not isinstance(instance_ids, list):
            instance_ids = None

        async with self._session_maker() as session:
            repo = RuntimeVersionRepository(session)
            current = await repo.get_active()
            target_version = request.get("version")

            if target_version:
                row = await repo.get_by_version(str(target_version))
            else:
                versions = await repo.list_all()
                inactive = [v for v in versions if v.status == RuntimeVersionStatus.INACTIVE.value]
                inactive.sort(key=lambda v: v.activated_at or v.installed_at or v.created_at, reverse=True)
                row = inactive[0] if inactive else None

            if row is None:
                raise RuntimeServiceError("No version available to rollback", code="not_found")
            if current and row.id == current.id:
                raise RuntimeServiceError("Target version is already active", code="invalid_state")

            rollout_ids = await self._resolve_rollback_instances(session, mode, instance_ids)
            original_bindings = {
                inst.id: inst.runtime_version_id
                for inst in (await session.execute(select(HermesInstance).where(HermesInstance.id.in_(rollout_ids))))
                .scalars()
                .all()
            }

            job.rollback_state_json = json.dumps(
                {
                    "targetVersionId": row.id,
                    "targetVersion": row.version,
                    "previousVersionId": current.id if current else None,
                    "previousVersion": current.version if current else None,
                    "originalBindings": original_bindings,
                    "reservedVersionIds": [v for v in {current.id if current else None, row.id} if v],
                    "mode": mode,
                }
            )
            await session.commit()

        await progress(
            f"Rolling back to {row.version}",
            phase="rollback",
            progress_value=0.3,
            event_type="job.phase_changed",
        )

        for idx, inst_id in enumerate(rollout_ids):
            token.raise_if_cancelled()
            await progress(
                f"Rebinding instance {inst_id}",
                phase="rollback",
                progress_value=0.3 + 0.5 * (idx + 1) / max(len(rollout_ids), 1),
            )
            await self._rebind_and_restart(inst_id, row.id, token)

        token.raise_if_cancelled()
        async with self._session_maker() as session:
            repo = RuntimeVersionRepository(session)
            activated = await repo.set_active(row.id)
            if activated is None:
                raise RuntimeServiceError("Rollback activation failed", code="activation_failed")
            self._activation.write_active_atomic(
                {
                    "version": activated.version,
                    "versionId": activated.id,
                    "executablePath": activated.executable_path,
                }
            )
            job_row = await session.get(RuntimeJob, job.id)
            if job_row is not None:
                job_row.completed_at = datetime.now(UTC)
            await session.commit()
            return {
                "version": activated.version,
                "previousVersion": current.version if current else None,
                "affectedInstances": rollout_ids,
            }

    async def _resolve_rollback_instances(
        self,
        session: AsyncSession,
        mode: str,
        instance_ids: list[str] | None,
    ) -> list[str]:
        if mode == "canary":
            plan_service = RuntimeUpdatePlanService(self._settings, self._session_maker)
            canary = await plan_service.pick_canary_instance_id(session, instance_ids)
            return [canary] if canary else []
        if mode == "selected" and instance_ids:
            return list(instance_ids)
        result = await session.execute(select(HermesInstance))
        return [i.id for i in result.scalars().all()]

    async def _rebind_and_restart(
        self,
        instance_id: str,
        version_id: str,
        token: CancellationToken,
    ) -> None:
        token.raise_if_cancelled()
        await self._gateway.stop_instance(instance_id)
        async with self._session_maker() as session:
            inst = await session.get(HermesInstance, instance_id)
            if inst is None:
                raise RuntimeServiceError(f"Instance not found: {instance_id}", code="not_found")
            inst.runtime_version_id = version_id
            await session.commit()
        token.raise_if_cancelled()
        await self._gateway.start_instance(instance_id)
        token.raise_if_cancelled()
        async with self._session_maker() as session:
            factory = HermesGatewayClientFactory(self._settings, session)
            client = await factory.create_for_instance(instance_id)
            if not await client.health_check():
                raise RuntimeServiceError("Gateway health failed after rollback", code="gateway_health_failed")
            await client.list_models()


class DoctorService:
    def __init__(self, settings: Settings, session_maker: async_sessionmaker[AsyncSession]) -> None:
        self._settings = settings
        self._session_maker = session_maker

    async def run_job(
        self,
        job: RuntimeJob,
        request: dict[str, Any],
        progress,
        cancellation_token: CancellationToken | None = None,
    ) -> dict[str, Any]:
        from pathlib import Path

        from runtime.environment_probe import EnvironmentProbe
        from runtime.platform_paths import RuntimeLayout

        await progress("Collecting diagnostics", phase="probe", progress_value=0.2, event_type="job.phase_changed")
        probe = EnvironmentProbe(self._settings).probe()
        layout = RuntimeLayout.from_root(self._settings.resolved_runtime_data_dir())
        layout.ensure()

        checks: list[dict[str, Any]] = [
            {"name": "platform", "ok": True, "value": probe.platform},
            {"name": "architecture", "ok": True, "value": probe.architecture},
            {"name": "disk", "ok": probe.disk_free_bytes > 100 * 1024 * 1024, "value": probe.disk_free_bytes},
            {
                "name": "python",
                "ok": probe.toolchain.python_path is not None,
                "value": str(probe.toolchain.python_path) if probe.toolchain.python_path else None,
            },
            {
                "name": "node",
                "ok": True,
                "value": str(probe.toolchain.node_path) if probe.toolchain.node_path else None,
            },
            {
                "name": "git",
                "ok": True,
                "value": str(probe.toolchain.git_path) if probe.toolchain.git_path else None,
            },
            {"name": "runtime_data_dir", "ok": layout.root.exists(), "value": str(layout.root)},
            {
                "name": "hermes_home",
                "ok": True,
                "value": str(self._settings.hermes_home_path),
                "exists": self._settings.hermes_home_path.exists(),
            },
        ]

        async with self._session_maker() as session:
            active = await RuntimeVersionRepository(session).get_active()
            checks.append(
                {
                    "name": "active_hermes",
                    "ok": active is not None,
                    "value": active.version if active else None,
                    "executableExists": Path(active.executable_path).exists() if active else False,
                }
            )
            await session.commit()

        await progress("Doctor complete", phase="completed", progress_value=1.0)
        return {"checks": checks, "ok": all(c.get("ok", True) for c in checks)}
