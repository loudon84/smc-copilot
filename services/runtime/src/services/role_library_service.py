from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path
from typing import Any

import yaml

from core.config import Settings
from core.constants import GatewayStatus, ProfileType
from db.models.profile import Profile
from db.models.role_spec import ProfileRoleSpec
from db.repositories.profile_repo import ProfileRepository
from db.repositories.role_spec_repo import RoleSpecRepository
from integrations.hermes.role_compiler import compile_role_files
from schemas.profile import ProfileCreate
from schemas.role_library import (
    PortConflictItem,
    PresetImportRequest,
    PresetImportResponse,
    RoleLibrarySyncRequest,
    RoleLibrarySyncResponse,
    RoleSpecResponse,
)
from services.gateway_supervisor import GatewaySupervisor
from services.profile_service import ProfileService

VALID_NAME_REGEX = re.compile(r"^[a-z][a-z0-9-]{1,31}$")
DEFAULT_ROLE_REPO = "https://github.com/jnMetaCode/agency-agents-zh.git"
DEFAULT_LOCAL_DIR = "agency-agents-zh"

ROLE_KEY_TO_TYPE: dict[str, ProfileType] = {
    "writer": ProfileType.WRITER,
    "engineer": ProfileType.ENGINEER,
    "research": ProfileType.RESEARCH,
    "hurman": ProfileType.HURMAN,
    "finance": ProfileType.FINANCE,
    "sales": ProfileType.SALES,
}


def preset_filenames_for_version(version: str) -> list[str]:
    """与 copilot-desktop role-preset-installer 文件名策略对齐。"""
    v = (version or "team_v1.4").strip()
    if v in ("team_v1.4", "v1.4"):
        return ["hermes-expert-profiles.team_v1.4.yaml", "hermes-expert-profiles.v1.yaml"]
    if v in ("v1", "1"):
        return ["hermes-expert-profiles.v1.yaml"]
    names = [f"hermes-expert-profiles.{v}.yaml"]
    sanitized = v.replace(".", "_")
    if sanitized != v:
        names.append(f"hermes-expert-profiles.{sanitized}.yaml")
    names.append("hermes-expert-profiles.v1.yaml")
    return names


class RoleLibraryService:
    def __init__(
        self,
        settings: Settings,
        profile_repo: ProfileRepository,
        role_spec_repo: RoleSpecRepository,
        gateway_supervisor: GatewaySupervisor | None = None,
    ) -> None:
        self._settings = settings
        self._profile_repo = profile_repo
        self._role_spec_repo = role_spec_repo
        self._gateway_supervisor = gateway_supervisor

    def role_library_path(self, local_dir: str | None = None) -> Path:
        dir_name = (local_dir or DEFAULT_LOCAL_DIR).strip()
        return self._settings.hermes_home_path / "desktop" / "role-library" / dir_name

    async def sync_library(self, body: RoleLibrarySyncRequest | None = None) -> RoleLibrarySyncResponse:
        ref = body or RoleLibrarySyncRequest()
        repo = (ref.repo or DEFAULT_ROLE_REPO).strip()
        branch = (ref.branch or "main").strip()
        local_path = self.role_library_path(ref.local_dir)

        try:
            local_path.parent.mkdir(parents=True, exist_ok=True)
            if not (local_path / ".git").is_dir():
                if local_path.exists() and any(local_path.iterdir()):
                    return RoleLibrarySyncResponse(
                        ok=False,
                        path=str(local_path),
                        error=f"Role library path exists but is not a git repo: {local_path}",
                    )
                await self._run_git(
                    None,
                    ["clone", "--depth", "1", "--branch", branch, repo, str(local_path)],
                )
            else:
                await self._run_git(local_path, ["fetch", "origin", branch])
                await self._run_git(local_path, ["checkout", branch])
                await self._run_git(local_path, ["reset", "--hard", f"origin/{branch}"])

            commit = await self._git_head(local_path)
            return RoleLibrarySyncResponse(ok=True, path=str(local_path), commit=commit)
        except Exception as exc:
            return RoleLibrarySyncResponse(ok=False, path=str(local_path), error=str(exc))

    async def _run_git(self, cwd: Path | None, args: list[str]) -> str:
        proc = await asyncio.create_subprocess_exec(
            "git",
            *args,
            cwd=str(cwd) if cwd else None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(stderr.decode(errors="replace") or stdout.decode(errors="replace"))
        return stdout.decode(errors="replace").strip()

    async def _git_head(self, repo_path: Path) -> str | None:
        try:
            return await self._run_git(repo_path, ["rev-parse", "HEAD"])
        except Exception:
            return None

    def _resolve_preset_yaml(self, body: PresetImportRequest) -> str:
        if body.preset_yaml:
            return body.preset_yaml
        search_dirs = [
            self._settings.package_root / "resources" / "profile-presets",
            Path(__file__).resolve().parents[2] / "resources" / "profile-presets",
        ]
        seen: set[Path] = set()
        for name in preset_filenames_for_version(body.preset_version):
            for base in search_dirs:
                path = base / name
                if path in seen:
                    continue
                seen.add(path)
                if path.is_file():
                    return path.read_text(encoding="utf-8")
        raise FileNotFoundError(f"No preset file found for version {body.preset_version}")

    async def import_preset(self, body: PresetImportRequest) -> PresetImportResponse:
        try:
            raw = self._resolve_preset_yaml(body)
            data = yaml.safe_load(raw) or {}
        except Exception as exc:
            return PresetImportResponse(ok=False, errors=[str(exc)])

        profiles_cfg: dict[str, Any] = data.get("profiles") or {}
        role_lib_cfg: dict[str, Any] = data.get("roleLibrary") or {}
        local_dir = role_lib_cfg.get("localDir") or DEFAULT_LOCAL_DIR
        source_repo = role_lib_cfg.get("repo") or DEFAULT_ROLE_REPO

        sync_result = await self.sync_library(
            RoleLibrarySyncRequest(repo=source_repo, branch=role_lib_cfg.get("branch"), local_dir=local_dir)
        )
        if not sync_result.ok:
            return PresetImportResponse(ok=False, errors=[sync_result.error or "role library sync failed"])

        source_root = Path(sync_result.path)
        port_conflicts: list[PortConflictItem] = []
        existing_without_overwrite: list[str] = []
        errors: list[str] = []
        imported = 0

        profile_svc = ProfileService(self._settings, self._profile_repo)

        for name, pdef in profiles_cfg.items():
            if not VALID_NAME_REGEX.match(name):
                errors.append(f"Invalid profile name: {name}")
                continue
            port = int(pdef.get("port") or 0)
            if port < 1024 or port > 65535:
                errors.append(f"Invalid port for {name}: {port}")
                continue

            existing = await self._profile_repo.get_by_name(name)
            if existing and not body.overwrite:
                existing_without_overwrite.append(name)
                continue

            conflict = await self._profile_repo.get_by_port(port, exclude_id=existing.id if existing else None)
            if conflict and conflict.name != name:
                port_conflicts.append(
                    PortConflictItem(profile_name=name, port=port, used_by_profile_name=conflict.name)
                )
                continue

            role_spec_cfg = pdef.get("roleSpec") or {}
            role_key = str(role_spec_cfg.get("roleKey") or name.split("-")[0])
            role_name = str(role_spec_cfg.get("roleName") or pdef.get("displayName") or name)
            source_paths = list(role_spec_cfg.get("sourcePaths") or [])
            profile_type = ROLE_KEY_TO_TYPE.get(role_key, ProfileType.SPECIALIST)

            try:
                if existing and body.overwrite:
                    if self._gateway_supervisor is not None:
                        try:
                            await self._gateway_supervisor.stop_profile(existing.id)
                        except Exception:
                            pass
                    old_spec = await self._role_spec_repo.get_by_profile_id(existing.id)
                    if old_spec:
                        await self._role_spec_repo.delete(old_spec)
                    await self._profile_repo.delete(existing)

                profile = await profile_svc.create_profile(
                    ProfileCreate(
                        name=name,
                        type=profile_type,
                        gateway_port=port,
                        enabled=bool(pdef.get("enabled", True)),
                        auto_start=bool(pdef.get("autoStart", pdef.get("auto_start", False))),
                    )
                )
                profile.display_name = str(pdef.get("displayName") or role_name)
                profile.role = str(pdef.get("role") or "specialist")
                profile.role_name = role_name
                profile.description = str(pdef.get("description") or pdef.get("role") or "")
                await self._profile_repo.update(profile)

                soul_path = memory_path = checksum = ""
                if source_paths:
                    soul_path, memory_path, _, checksum = compile_role_files(
                        profile_name=name,
                        profile_home=Path(profile.profile_path),
                        port=port,
                        role_key=role_key,
                        role_name=role_name,
                        role_summary=profile.description,
                        source_repo=str(role_spec_cfg.get("sourceRepo") or source_repo),
                        source_root=source_root,
                        source_paths=source_paths,
                    )

                spec = ProfileRoleSpec(
                    profile_id=profile.id,
                    role_key=role_key,
                    role_name=role_name,
                    source_repo=str(role_spec_cfg.get("sourceRepo") or source_repo),
                    source_paths_json=json.dumps(source_paths, ensure_ascii=False),
                    soul_path=soul_path or None,
                    memory_path=memory_path or None,
                    source_checksum=checksum or None,
                    output_mode=str(role_spec_cfg.get("outputMode") or "soul-memory-skill"),
                )
                await self._role_spec_repo.create(spec)
                imported += 1
            except Exception as exc:
                errors.append(f"{name}: {exc}")

        ok = (
            imported > 0
            and not port_conflicts
            and not existing_without_overwrite
            and not errors
        )
        return PresetImportResponse(
            ok=ok,
            imported_count=imported,
            port_conflicts=port_conflicts,
            existing_without_overwrite=existing_without_overwrite,
            errors=errors,
        )

    async def list_specs(self) -> list[RoleSpecResponse]:
        specs = await self._role_spec_repo.list_all()
        return [RoleSpecResponse.model_validate(s) for s in specs]

    async def recompile_role(self, profile_id: str) -> RoleSpecResponse:
        profile = await self._profile_repo.get_by_id(profile_id)
        if profile is None:
            from core.errors import NotFoundError

            raise NotFoundError(f"Profile {profile_id} not found")

        spec = await self._role_spec_repo.get_by_profile_id(profile_id)
        if spec is None:
            from core.errors import NotFoundError

            raise NotFoundError(f"Role spec for profile {profile_id} not found")

        source_paths = json.loads(spec.source_paths_json)
        role_lib_cfg = RoleLibrarySyncRequest(local_dir=DEFAULT_LOCAL_DIR, repo=spec.source_repo)
        sync_result = await self.sync_library(role_lib_cfg)
        if not sync_result.ok:
            from core.errors import CopilotError

            raise CopilotError(sync_result.error or "role library sync failed", code="gateway_error")

        soul_path, memory_path, _, checksum = compile_role_files(
            profile_name=profile.name,
            profile_home=Path(profile.profile_path),
            port=profile.gateway_port,
            role_key=spec.role_key,
            role_name=spec.role_name,
            role_summary=profile.description,
            source_repo=spec.source_repo,
            source_root=Path(sync_result.path),
            source_paths=source_paths,
        )
        spec.soul_path = soul_path
        spec.memory_path = memory_path
        spec.source_checksum = checksum
        updated = await self._role_spec_repo.update(spec)
        return RoleSpecResponse.model_validate(updated)
