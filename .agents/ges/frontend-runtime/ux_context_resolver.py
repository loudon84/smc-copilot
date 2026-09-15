"""Per-app UX baseline, surface gate, visual intent, incremental refresh."""
from __future__ import annotations

import hashlib
import json
import re
from fnmatch import fnmatch
from pathlib import Path, PurePosixPath
from typing import Any

from frontend_app_registry import (
    FRONTEND_ROOT,
    component_reuse_automatic,
    derive_boundary,
    discover,
    find_app_for_path,
    is_shared_ui_path,
    load_registry,
    refresh_baseline_statuses,
    resolve_shared_components,
)
from stack_classifier import classify

DECISIONS = ("REUSE", "EXTEND", "MODIFY", "HIDE", "REPLACE", "ADD_NEW")
UX_SURFACE_REUSE_REQUIRED = "UX_SURFACE_REUSE_REQUIRED"
VISUAL_SCHEMA = "smc.ges.visual-intent.v1"
SURFACE_SCHEMA = "smc.ges.surface-registry.v1"
BASELINE_SCHEMA = "smc.ges.per-app-baseline.v1"
APP_PROFILE_SCHEMA = "smc.ges.app-profile.v2"
APP_PROFILE_SCHEMA_LEGACY = "smc.ges.app-profile.v1"
FEATURE_SCOPE_SCHEMA = "smc.ges.feature-scope.v1"

# Build/output/docs trees are never UX baseline sources.
_SKIP_DIR_NAMES = frozenset(
    {
        "node_modules",
        "dist",
        "out",
        "build",
        "coverage",
        ".git",
        ".agents",
        "references",
        "wiki",
        "__pycache__",
        ".vite",
        ".turbo",
        ".next",
        ".nuxt",
    }
)

_PACKAGE_ADAPTERS = Path(__file__).resolve().parent.parent / "frontend-adapters"


def _norm(rel: str) -> str:
    return rel.replace("\\", "/")


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _app_dir(repo: Path, app_id: str) -> Path:
    return repo / FRONTEND_ROOT / "apps" / app_id


def _get_app(repo: Path, app_id: str) -> dict[str, Any]:
    registry = load_registry(repo) or discover(repo)
    for app in registry.get("apps") or []:
        if app.get("app_id") == app_id:
            return app
    raise KeyError(f"unknown app_id: {app_id}")


def _iter_source_files(app_fs_root: Path) -> list[Path]:
    out: list[Path] = []
    if not app_fs_root.is_dir():
        return out
    for pattern in ("**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.ts", "**/*.js"):
        for path in app_fs_root.glob(pattern):
            if not path.is_file():
                continue
            if any(part in _SKIP_DIR_NAMES for part in path.parts):
                continue
            if "__tests__" in path.parts or "test" == path.parent.name:
                # Keep src/**/test helpers out of component inventories when nested under */test/*
                if path.parent.name == "test" and "src" in path.parts:
                    continue
            if path.name.endswith((".d.ts", ".test.tsx", ".test.ts", ".spec.ts", ".spec.tsx")):
                continue
            out.append(path)
    return sorted(out)


def _load_adapter(repo: Path, stack_adapter: str) -> dict[str, Any] | None:
    if not stack_adapter:
        return None
    for base in (repo / ".agents" / "ges" / "frontend-adapters", _PACKAGE_ADAPTERS):
        path = base / stack_adapter / "adapter.json"
        data = _read_json(path)
        if data:
            return data
    return None


def _matches_any_glob(rel: str, patterns: list[str]) -> bool:
    norm = _norm(rel).lstrip("./")
    posix = PurePosixPath(norm)
    for pattern in patterns:
        pat = _norm(pattern).lstrip("./")
        if not pat:
            continue
        if posix.match(pat) or fnmatch(norm, pat):
            return True
        # Path.match is anchored; also allow repo-style apps/*/… against full rel
        if "*" in pat and fnmatch(norm, pat):
            return True
    return False


def _filter_by_adapter_globs(
    repo: Path,
    paths: list[Path],
    *,
    app_root: str,
    stack_adapter: str,
) -> list[Path]:
    """Prefer adapter component_globs (+ renderer) when present; else keep all."""
    adapter = _load_adapter(repo, stack_adapter)
    if not adapter:
        return paths
    globs = list(adapter.get("component_globs") or [])
    # Renderer trees are always in-scope for Electron/web UX inventories.
    globs.extend(list(adapter.get("renderer") or []))
    # Deduplicate while preserving order
    seen: set[str] = set()
    uniq: list[str] = []
    for g in globs:
        key = _norm(str(g))
        if key in seen:
            continue
        seen.add(key)
        uniq.append(key)
    if not uniq:
        return paths
    app_fs = (repo / app_root).resolve() if app_root not in {".", ""} else repo
    out: list[Path] = []
    for path in paths:
        rel = _norm(str(path.relative_to(repo)))
        try:
            app_rel = _norm(str(path.relative_to(app_fs)))
        except ValueError:
            app_rel = rel
        if _matches_any_glob(app_rel, uniq) or _matches_any_glob(rel, uniq):
            out.append(path)
    # Fail open: if adapter globs match nothing, keep boundary scan (minus excludes).
    return out if out else paths


def _path_under_roots(rel: str, roots: list[str]) -> bool:
    norm = _norm(rel)
    for root in roots:
        r = _norm(root)
        if r in {".", ""}:
            continue
        if norm == r or norm.startswith(r.rstrip("/") + "/"):
            return True
    return False


def _iter_boundary_files(
    repo: Path,
    allowed_roots: list[str],
    forbidden_roots: list[str],
) -> list[Path]:
    """Scan only allowed_roots; forbidden wins on conflict (C24)."""
    out: list[Path] = []
    seen: set[str] = set()
    for root_rel in allowed_roots:
        if _path_under_roots(root_rel, forbidden_roots):
            continue
        fs = (repo / root_rel).resolve() if root_rel not in {".", ""} else repo
        for path in _iter_source_files(fs):
            rel = _norm(str(path.relative_to(repo)))
            if _path_under_roots(rel, forbidden_roots):
                continue
            if not _path_under_roots(rel, allowed_roots) and root_rel not in {".", ""}:
                continue
            if rel in seen:
                continue
            seen.add(rel)
            out.append(path)
    return sorted(out)


def _infer_ux_role(path: Path, rel: str) -> str | None:
    name = path.name.lower()
    text_bits = f"{name} {rel.lower()}"
    if (
        re.search(r"layout", name)
        or "switcher" in name
        or "sidebar" in text_bits
        or "footer" in text_bits
        or "profile" in name
        or "identity" in name
        or "account" in name
    ):
        # Layout*.tsx / *Switcher* / sidebar|footer → identity_control candidates
        if (
            re.match(r"layout.*\.(tsx|jsx|vue)$", name)
            or "switcher" in name
            or "sidebar" in text_bits
            or "footer" in text_bits
            or "profile" in name
            or "identity" in name
        ):
            return "identity_control"
    if "setting" in name:
        return "settings"
    if "nav" in name or "sidebar" in name:
        return "navigation"
    if "header" in name:
        return "chrome"
    return None


def _visual_position(rel: str, name: str) -> str:
    lower = f"{rel} {name}".lower()
    if "footer" in lower:
        return "sidebar.footer"
    if "sidebar" in lower:
        return "sidebar"
    if "header" in lower:
        return "header"
    if "layout" in lower:
        return "app-shell"
    return "workspace"


def _scan_surfaces(
    repo: Path,
    app_id: str,
    allowed_roots: list[str],
    forbidden_roots: list[str],
) -> list[dict[str, Any]]:
    surfaces: list[dict[str, Any]] = []
    layout_owner: str | None = None
    for path in _iter_boundary_files(repo, allowed_roots, forbidden_roots):
        rel = _norm(str(path.relative_to(repo)))
        if re.match(r"layout.*\.(tsx|jsx|vue)$", path.name, re.I):
            layout_owner = rel
        role = _infer_ux_role(path, rel)
        if not role:
            continue
        pos = _visual_position(rel, path.name)
        surface_id = f"{app_id}:{pos}.{role}" if role != "identity_control" else f"{app_id}:{pos}.identity"
        if role == "identity_control" and pos == "sidebar.footer":
            surface_id = f"{app_id}:sidebar.footer.identity"
        elif role == "identity_control":
            surface_id = f"{app_id}:{pos}.identity"
        surfaces.append(
            {
                "surface_id": surface_id,
                "app_id": app_id,
                "ux_role": role,
                "business_entities": [],
                "owner": rel,
                "layout_owner": layout_owner,
                "visual_position": pos,
                "actions": ["show_identity", "switch_profile"] if role == "identity_control" else [],
                "action_cluster": "identity" if role == "identity_control" else role,
                "reuse_priority": "HIGH" if role == "identity_control" else "MEDIUM",
                "status": "FRESH",
            }
        )
    # Deduplicate by surface_id keeping first HIGH owner (Switcher preferred)
    by_id: dict[str, dict[str, Any]] = {}
    for s in surfaces:
        sid = s["surface_id"]
        if sid not in by_id:
            by_id[sid] = s
            continue
        # Prefer Switcher / Profile over Layout as owner
        if "switcher" in s["owner"].lower() or "profile" in Path(s["owner"]).name.lower():
            prev = by_id[sid]
            s["layout_owner"] = s.get("layout_owner") or prev.get("layout_owner") or prev.get("owner")
            by_id[sid] = s
    # Fill layout_owner globally if found
    if layout_owner:
        for s in by_id.values():
            s["layout_owner"] = s.get("layout_owner") or layout_owner
    return list(by_id.values())


def _scan_components(
    repo: Path,
    allowed_roots: list[str],
    forbidden_roots: list[str],
    *,
    app_root: str = ".",
    stack_adapter: str = "",
) -> list[dict[str, Any]]:
    comps: list[dict[str, Any]] = []
    paths = _iter_boundary_files(repo, allowed_roots, forbidden_roots)
    paths = _filter_by_adapter_globs(
        repo, paths, app_root=app_root, stack_adapter=stack_adapter
    )
    for path in paths:
        rel = _norm(str(path.relative_to(repo)))
        comps.append({"name": path.stem, "path": rel})
    return comps


def _scan_layouts(
    repo: Path,
    allowed_roots: list[str],
    forbidden_roots: list[str],
) -> dict[str, Any]:
    regions: dict[str, Any] = {}
    owner = None
    for path in _iter_boundary_files(repo, allowed_roots, forbidden_roots):
        rel = _norm(str(path.relative_to(repo)))
        if re.match(r"layout.*\.(tsx|jsx|vue)$", path.name, re.I):
            owner = rel
        if "switcher" in path.name.lower() or "profile" in path.name.lower():
            regions["sidebar.footer"] = {"owner": path.stem, "path": rel}
    return {
        "app-shell": {
            "owner": owner,
            "regions": regions,
        }
    }


def _fingerprint(files: list[dict[str, Any]]) -> str:
    h = hashlib.sha256()
    for item in sorted(files, key=lambda x: x.get("path") or x.get("owner") or ""):
        h.update((item.get("path") or item.get("owner") or "").encode("utf-8"))
        h.update(b"\0")
    return h.hexdigest()


# @lat: [[frontend-context#Per-App UX Baseline]]
# @lat: [[frontend-context#Application Boundary]]
def generate_baseline(repo: str | Path, app_id: str) -> dict[str, Any]:
    """Generate per-app UX baseline artifacts under .agents/ges/frontend/apps/<app-id>/."""
    root = Path(repo).resolve()
    registry = load_registry(root) or discover(root)
    app = _get_app(root, app_id)
    app_root = str(app.get("root") or ".")
    classified = classify(root, app_root)
    boundary = derive_boundary(root, app_id, registry=registry)
    allowed = list(boundary.get("allowed_roots") or [app_root])
    forbidden = list(boundary.get("forbidden_roots") or [])
    surfaces = _scan_surfaces(root, app_id, allowed, forbidden)
    components = _scan_components(
        root,
        allowed,
        forbidden,
        app_root=app_root,
        stack_adapter=str(classified.get("stack_adapter") or ""),
    )
    layouts = _scan_layouts(root, allowed, forbidden)

    out_dir = _app_dir(root, app_id)
    app_profile = {
        "schema": APP_PROFILE_SCHEMA,
        "app_id": app_id,
        "root": app_root,
        "runtime": classified["runtime"],
        "framework": classified["framework"],
        "stack_adapter": classified["stack_adapter"],
        "boundary": boundary,
    }
    ui_baseline = {
        "schema": BASELINE_SCHEMA,
        "app_id": app_id,
        "surface_count": len(surfaces),
        "component_count": len(components),
        "adoption_mode": "OBSERVE",
        "provenance": "generated",
        "calibration_status": "PENDING",
    }
    surface_registry = {
        "schema": SURFACE_SCHEMA,
        "app_id": app_id,
        "surfaces": surfaces,
    }
    layout_map = {"schema": "smc.ges.layout-map.v1", "app_id": app_id, "layouts": layouts}
    navigation_map = {
        "schema": "smc.ges.navigation-map.v1",
        "app_id": app_id,
        "entries": [s for s in surfaces if s.get("ux_role") in {"navigation", "chrome"}],
    }
    component_registry = {
        "schema": "smc.ges.component-registry.v1",
        "app_id": app_id,
        "components": components,
    }
    state_owner_map = {
        "schema": "smc.ges.state-owner-map.v1",
        "app_id": app_id,
        "owners": [],
    }
    design_system = {
        "schema": "smc.ges.design-system.v1",
        "app_id": app_id,
        "tokens": [],
        "primitives": [],
    }
    lock = {
        "schema": "smc.ges.baseline-lock.v1",
        "app_id": app_id,
        "fingerprint": _fingerprint(surfaces + components),
        "status": "FRESH",
        "stack_adapter": classified["stack_adapter"],
    }

    _write_json(out_dir / "app-profile.json", app_profile)
    _write_json(out_dir / "ui-baseline.json", ui_baseline)
    _write_json(out_dir / "surface-registry.json", surface_registry)
    _write_json(out_dir / "layout-map.json", layout_map)
    _write_json(out_dir / "navigation-map.json", navigation_map)
    _write_json(out_dir / "component-registry.json", component_registry)
    _write_json(out_dir / "state-owner-map.json", state_owner_map)
    _write_json(out_dir / "design-system.json", design_system)
    _write_json(out_dir / "baseline.lock", lock)

    # Keep registry baseline_status in sync after writing
    refresh_baseline_statuses(root)

    return {
        "schema": BASELINE_SCHEMA,
        "app_id": app_id,
        "dir": _norm(str(out_dir.relative_to(root))),
        "surfaces": surfaces,
        "stack_adapter": classified["stack_adapter"],
        "boundary": boundary,
    }


def load_app_profile(repo: str | Path, app_id: str) -> dict[str, Any]:
    """Load app-profile with v1→v2 boundary derivation."""
    root = Path(repo).resolve()
    path = _app_dir(root, app_id) / "app-profile.json"
    data = _read_json(path)
    if not data:
        return {}
    if data.get("schema") == APP_PROFILE_SCHEMA_LEGACY or "boundary" not in data:
        data = dict(data)
        data["schema"] = APP_PROFILE_SCHEMA
        data["boundary"] = derive_boundary(root, app_id)
    return data


# @lat: [[frontend-context#Feature Scope Pipeline]]
def resolve_feature_scope(
    repo: str | Path,
    *,
    app_id: str | None = None,
    ux_role: str | None = None,
    action_cluster: str | None = None,
    component_name: str | None = None,
    decision_request: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Unified Feature Scope pipeline: Application → Surface → Layout → Component Reuse."""
    root = Path(repo).resolve()
    registry = load_registry(root) or discover(root)
    apps = list(registry.get("apps") or [])
    if not app_id:
        if len(apps) == 1:
            app_id = str(apps[0].get("app_id"))
        else:
            raise ValueError("FEATURE_SCOPE_APP_REQUIRED")
    app = next((a for a in apps if a.get("app_id") == app_id), None)
    if not app:
        raise KeyError(f"unknown app_id: {app_id}")

    role = ux_role or "identity_control"
    surfaces = resolve_surface(root, app_id, role, action_cluster=action_cluster)
    primary = surfaces[0] if surfaces else None
    layout_owner = (primary or {}).get("layout_owner")

    req = dict(decision_request or {})
    if surfaces and not req:
        req = {
            "same_ux_role": True,
            "decision": "EXTEND",
        }
    elif not surfaces and not req:
        req = {"decision": "ADD_NEW", "prefer_new": True}
    gate = reuse_gate(req)

    shared_hit = None
    if component_name:
        shared_hit = resolve_shared_components(root)
        from frontend_app_registry import shared_ui_reuse_decision

        shared_decision = shared_ui_reuse_decision(root, component_name)
    else:
        shared_decision = {
            "decision": None,
            "component": None,
            "package_id": None,
            "reason": "NO_COMPONENT_REQUESTED",
        }

    stack = str(app.get("stack_adapter") or "")
    reuse = component_reuse_automatic(
        stack,
        stack,
        via_shared_package=bool(shared_decision.get("package_id")),
    )

    result = {
        "schema": FEATURE_SCOPE_SCHEMA,
        "application": {
            "app_id": app_id,
            "root": app.get("root"),
            "stack_adapter": stack,
        },
        "surface": {
            "candidates": surfaces,
            "primary": primary,
            "gate": gate,
        },
        "layout_owner": {
            "path": layout_owner,
            "resolved": bool(layout_owner),
        },
        "component_reuse": {
            "shared": shared_decision,
            "policy": reuse,
        },
        "decision": gate.get("decision"),
        "ok": bool(gate.get("ok")) and all(
            [
                app_id,
                gate.get("decision") is not None,
                "layout_owner" in {"layout_owner"},  # section always present
                reuse is not None,
            ]
        ),
    }
    # Four sections must exist (PRD §10)
    for key in ("application", "surface", "layout_owner", "component_reuse"):
        if key not in result or result[key] is None:
            result["ok"] = False
    return result


def _load_surfaces(repo: Path, app_id: str) -> list[dict[str, Any]]:
    path = _app_dir(repo, app_id) / "surface-registry.json"
    data = _read_json(path)
    if not data:
        generate_baseline(repo, app_id)
        data = _read_json(path) or {}
    return list(data.get("surfaces") or [])


# @lat: [[frontend-context#Surface Registry]]
def resolve_surface(
    repo: str | Path,
    app_id: str,
    ux_role: str,
    action_cluster: str | None = None,
) -> list[dict[str, Any]]:
    """Return candidate surfaces for a UX role within one app."""
    root = Path(repo).resolve()
    candidates: list[dict[str, Any]] = []
    for surface in _load_surfaces(root, app_id):
        if surface.get("app_id") != app_id:
            continue
        role_match = surface.get("ux_role") == ux_role
        cluster_match = bool(action_cluster) and surface.get("action_cluster") == action_cluster
        if role_match or cluster_match:
            candidates.append(dict(surface))
    candidates.sort(key=lambda s: (0 if s.get("reuse_priority") == "HIGH" else 1, s.get("surface_id") or ""))
    return candidates


# @lat: [[frontend-context#UX Surface Reuse Gate]]
def reuse_gate(decision_request: dict[str, Any]) -> dict[str, Any]:
    """Decide REUSE|EXTEND|MODIFY|HIDE|REPLACE|ADD_NEW; gate ADD_NEW without justification."""
    req = dict(decision_request or {})
    requested = str(req.get("decision") or req.get("requested_decision") or "").upper()
    same_ux_role = bool(
        req.get("same_ux_role")
        or req.get("SAME_UX_ROLE")
        or req.get("match") == "SAME_UX_ROLE"
    )
    same_action = bool(
        req.get("same_action_cluster")
        or req.get("SAME_ACTION_CLUSTER")
        or req.get("match") == "SAME_ACTION_CLUSTER"
    )
    justification = req.get("NEW_SURFACE_JUSTIFICATION") or req.get("new_surface_justification")

    # SAME_UX_ROLE or SAME_ACTION_CLUSTER → default EXTEND (ADD_NEW is overridden)
    if same_ux_role or same_action:
        decision = "EXTEND"
        if requested in {"REUSE", "EXTEND", "MODIFY", "HIDE", "REPLACE"}:
            decision = requested
        return {
            "ok": True,
            "decision": decision,
            "reason": "SAME_UX_ROLE" if same_ux_role else "SAME_ACTION_CLUSTER",
            "code": None,
        }

    if requested == "ADD_NEW" or req.get("prefer_new") is True:
        if not justification:
            return {
                "ok": False,
                "decision": "ADD_NEW",
                "reason": "missing NEW_SURFACE_JUSTIFICATION",
                "code": UX_SURFACE_REUSE_REQUIRED,
            }
        return {
            "ok": True,
            "decision": "ADD_NEW",
            "reason": "NEW_SURFACE_JUSTIFICATION",
            "code": None,
        }

    if requested in DECISIONS:
        return {"ok": True, "decision": requested, "reason": "EXPLICIT", "code": None}

    return {"ok": True, "decision": "EXTEND", "reason": "DEFAULT_EXISTING", "code": None}


# @lat: [[frontend-context#Visual Intent]]
def bind_visual_intent(payload: dict[str, Any]) -> dict[str, Any]:
    """Bind screenshot / prototype / keep-modify-hide intent to smc.ges.visual-intent.v1."""
    data = dict(payload or {})
    return {
        "schema": VISUAL_SCHEMA,
        "app_id": data.get("app_id"),
        "target_surface": data.get("target_surface"),
        "keep": list(data.get("keep") or []),
        "modify": list(data.get("modify") or []),
        "hide": list(data.get("hide") or []),
        "must_not_add": list(data.get("must_not_add") or []),
        "source": data.get("source") or "explicit",
    }


def _mark_surfaces_stale(repo: Path, app_id: str, status: str = "DEPENDENCY_STALE") -> int:
    path = _app_dir(repo, app_id) / "surface-registry.json"
    data = _read_json(path)
    if not data:
        return 0
    n = 0
    for surface in data.get("surfaces") or []:
        surface["status"] = status
        n += 1
    _write_json(path, data)
    lock_path = _app_dir(repo, app_id) / "baseline.lock"
    lock = _read_json(lock_path) or {"schema": "smc.ges.baseline-lock.v1", "app_id": app_id}
    lock["status"] = status
    _write_json(lock_path, lock)
    return n


# @lat: [[frontend-context#Incremental Refresh]]
def incremental_refresh(repo: str | Path, changed_paths: list[str]) -> dict[str, Any]:
    """Refresh only apps affected by changed_paths; mark shared-ui dependents DEPENDENCY_STALE."""
    root = Path(repo).resolve()
    registry = load_registry(root) or discover(root)
    all_app_ids = [str(a.get("app_id")) for a in (registry.get("apps") or []) if a.get("app_id")]

    affected_apps: set[str] = set()
    shared_hit = False
    for raw in changed_paths or []:
        rel = _norm(str(raw))
        if is_shared_ui_path(root, rel):
            shared_hit = True
            continue
        app_id = find_app_for_path(root, rel)
        if app_id:
            affected_apps.add(app_id)

    refreshed: list[str] = []
    stale_marked: list[str] = []

    # Never full-rescan all apps: only touched apps (+ shared dependents as stale)
    for app_id in sorted(affected_apps):
        generate_baseline(root, app_id)
        refreshed.append(app_id)

    if shared_hit:
        # Refresh shared registry components
        resolve_shared_components(root)
        discover(root)  # rewrite shared registry
        for app_id in all_app_ids:
            if app_id in affected_apps:
                continue
            # dependents of shared-ui: mark stale, do not regenerate baseline content
            if (_app_dir(root, app_id) / "surface-registry.json").is_file():
                _mark_surfaces_stale(root, app_id, "DEPENDENCY_STALE")
                stale_marked.append(app_id)
            elif app_id not in refreshed:
                # ensure baseline exists then mark
                try:
                    generate_baseline(root, app_id)
                except KeyError:
                    continue
                _mark_surfaces_stale(root, app_id, "DEPENDENCY_STALE")
                stale_marked.append(app_id)

    untouched = [a for a in all_app_ids if a not in refreshed and a not in stale_marked]
    return {
        "schema": "smc.ges.incremental-refresh.v1",
        "changed_paths": [_norm(p) for p in (changed_paths or [])],
        "refreshed_apps": refreshed,
        "dependency_stale_apps": stale_marked,
        "untouched_apps": untouched,
        "shared_ui_changed": shared_hit,
        "full_rescan": False,
    }
