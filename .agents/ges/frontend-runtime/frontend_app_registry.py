"""Frontend Application Registry — discover apps and shared UI packages."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from stack_classifier import classify

SCHEMA = "smc.ges.frontend-app-registry.v2"
SCHEMA_LEGACY = "smc.ges.frontend-app-registry.v1"
ALLOWED_SCHEMAS = frozenset({SCHEMA, SCHEMA_LEGACY})
SHARED_SCHEMA = "smc.ges.shared-ui-registry.v1"
FRONTEND_ROOT = Path(".agents") / "ges" / "frontend"
APPS_REGISTRY_REL = FRONTEND_ROOT / "apps-registry.json"
SHARED_REGISTRY_REL = FRONTEND_ROOT / "shared" / "shared-ui-registry.json"
BASELINE_STATUSES = frozenset({"INITIALIZED", "NOT_INITIALIZED", "STALE"})

_FRONTEND_MARKERS = (
    "package.json",
    "vite.config.ts",
    "vite.config.js",
    "vite.config.mjs",
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "nuxt.config.ts",
    "nuxt.config.js",
    "src/main.tsx",
    "src/main.ts",
    "src/App.tsx",
    "src/App.vue",
    "index.html",
)


def _norm(rel: str) -> str:
    return rel.replace("\\", "/").rstrip("/")


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


def _looks_frontend(root: Path) -> bool:
    for marker in _FRONTEND_MARKERS:
        if (root / marker).exists():
            return True
    return False


def _is_shared_ui_name(name: str) -> bool:
    return name == "ui" or name.endswith("-ui")


def _pkg_name(repo: Path, app_root: Path) -> str | None:
    for candidate in (app_root / "package.json", repo / "package.json"):
        data = _read_json(candidate)
        if data and isinstance(data.get("name"), str) and data["name"].strip():
            name = data["name"].strip()
            # strip scope
            if "/" in name:
                name = name.rsplit("/", 1)[-1]
            return name
    return None


def _repository_name(repo: Path) -> str:
    return _pkg_name(repo, repo) or repo.name


def _baseline_dir(repo: Path, app_id: str) -> Path:
    return repo / FRONTEND_ROOT / "apps" / app_id


def _detect_baseline_status(repo: Path, app_id: str) -> str:
    app_dir = _baseline_dir(repo, app_id)
    required = ("app-profile.json", "ui-baseline.json", "surface-registry.json")
    if not all((app_dir / name).is_file() for name in required):
        return "NOT_INITIALIZED"
    lock = _read_json(app_dir / "baseline.lock") or _read_json(app_dir / "baseline.lock.json")
    status = str((lock or {}).get("status") or "FRESH").upper()
    if status in {"STALE", "DEPENDENCY_STALE"}:
        return "STALE"
    return "INITIALIZED"


def _app_entry(repo: Path, app_id: str, root_rel: str) -> dict[str, Any]:
    classified = classify(repo, root_rel)
    return {
        "app_id": app_id,
        "root": _norm(root_rel),
        "runtime": classified["runtime"],
        "framework": classified["framework"],
        "stack_adapter": classified["stack_adapter"],
        "baseline_status": _detect_baseline_status(repo, app_id),
    }


def _shared_ui_roots(repo: Path) -> set[str]:
    packages = repo / "packages"
    candidates: list[str] = []
    if not packages.is_dir():
        return set()

    def walk(current: Path, depth: int) -> None:
        if depth > 3:
            return
        try:
            children = sorted(current.iterdir())
        except OSError:
            return
        for child in children:
            if not child.is_dir() or child.name.startswith(".") or child.name == "node_modules":
                continue
            rel_depth = len(Path(_norm(str(child.relative_to(packages)))).parts)
            if rel_depth > 3:
                continue
            if _is_shared_ui_name(child.name):
                candidates.append(_norm(str(child.relative_to(repo))))
            walk(child, depth + 1)

    walk(packages, 1)
    # Prefer deepest path when parent/child both match (packages/ui vs packages/ui/nested-ui)
    keep: set[str] = set()
    for root in sorted(candidates, key=lambda r: (-len(Path(r).parts), r)):
        # Skip shallower ancestor of an already-kept deeper root
        if any(other != root and other.startswith(root.rstrip("/") + "/") for other in keep):
            continue
        # Drop any already-kept shallower ancestors of this root
        keep = {k for k in keep if not (k != root and root.startswith(k.rstrip("/") + "/"))}
        keep.add(root)
    return keep


# @lat: [[frontend-context#Shared UI Registry]]
def _discover_shared_ui(repo: Path) -> list[dict[str, Any]]:
    """Discover shared UI under packages/ up to 3 levels deep (C22)."""
    found: list[dict[str, Any]] = []
    for root_rel in sorted(_shared_ui_roots(repo)):
        pkg_root = repo / root_rel
        package_id = Path(root_rel).name
        # Disambiguate nested packages that share the leaf name "ui"
        if root_rel.count("/") > 1:
            package_id = _norm(root_rel).replace("/", "-")
        components = _scan_shared_components(repo, pkg_root)
        found.append(
            {
                "package_id": package_id,
                "root": root_rel,
                "kind": "shared-ui-library",
                "components": components,
            }
        )
    return found


def _scan_shared_components(repo: Path, pkg_root: Path) -> list[dict[str, Any]]:
    components: list[dict[str, Any]] = []
    patterns = ("**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.ts", "**/*.js")
    seen: set[str] = set()
    for pattern in patterns:
        for path in sorted(pkg_root.glob(pattern)):
            if not path.is_file():
                continue
            if path.name.startswith(".") or path.name.endswith(".d.ts"):
                continue
            if "node_modules" in path.parts or "__tests__" in path.parts or path.name.endswith(".test.tsx"):
                continue
            rel = _norm(str(path.relative_to(repo)))
            stem = path.stem
            if stem in {"index", "main"}:
                continue
            if stem in seen:
                continue
            seen.add(stem)
            components.append(
                {
                    "name": stem,
                    "path": rel,
                    "reuse": "REUSE",
                }
            )
    return components


def _shared_root_set(shared: list[dict[str, Any]]) -> set[str]:
    return {_norm(str(s.get("root") or "")) for s in shared if s.get("root")}


# @lat: [[frontend-context#Frontend Application Registry]]
def discover(repo: str | Path, *, persist: bool = True) -> dict[str, Any]:
    """Discover frontend apps and shared UI packages under a consumer repo."""
    root = Path(repo).resolve()
    apps: list[dict[str, Any]] = []
    seen_roots: set[str] = set()
    shared = _discover_shared_ui(root)
    shared_roots = _shared_root_set(shared)

    def add_app(app_id: str, root_rel: str) -> None:
        key = _norm(root_rel)
        if key in seen_roots:
            return
        if key in shared_roots:
            return  # shared UI packages are never registered as apps
        seen_roots.add(key)
        apps.append(_app_entry(root, app_id, key))

    # Monorepo apps/*
    apps_dir = root / "apps"
    if apps_dir.is_dir():
        for child in sorted(apps_dir.iterdir()):
            if not child.is_dir() or child.name.startswith("."):
                continue
            if _looks_frontend(child) or (child / "src").is_dir():
                add_app(child.name, str(child.relative_to(root)))

    # packages/* frontend apps (exclude shared UI at any nested depth)
    packages_dir = root / "packages"
    if packages_dir.is_dir():
        for child in sorted(packages_dir.iterdir()):
            if not child.is_dir() or child.name.startswith("."):
                continue
            rel = _norm(str(child.relative_to(root)))
            if rel in shared_roots or any(rel == s or s.startswith(rel + "/") for s in shared_roots):
                continue
            if _is_shared_ui_name(child.name):
                continue
            if _looks_frontend(child):
                add_app(child.name, rel)

    # Single-package electron: src/renderer (+ optional src/main)
    renderer = root / "src" / "renderer"
    if renderer.is_dir():
        pkg_name = _pkg_name(root, root) or "desktop"
        add_app(pkg_name, "src/renderer")

    # Root single-package SPA (no apps/, no src/renderer)
    if not apps and _looks_frontend(root):
        pkg_name = _pkg_name(root, root) or "app"
        add_app(pkg_name, ".")

    data = {
        "schema": SCHEMA,
        "repository": _repository_name(root),
        "apps": apps,
        "shared_ui": [{"package_id": s["package_id"], "root": s["root"], "kind": s["kind"]} for s in shared],
    }
    shared_payload = {
        "schema": SHARED_SCHEMA,
        "packages": shared,
    }
    if persist:
        save_registry(root, data)
        _write_json(root / SHARED_REGISTRY_REL, shared_payload)
    return data


def load_registry(repo: str | Path) -> dict[str, Any] | None:
    """Load apps-registry; accept v1 and v2 schemas (C21 compatibility)."""
    root = Path(repo).resolve()
    data = _read_json(root / APPS_REGISTRY_REL)
    if not data:
        return None
    schema = data.get("schema")
    if schema not in ALLOWED_SCHEMAS and schema is not None:
        return data  # still return; callers may inspect
    # Soft-upgrade in memory for v1 payloads
    if schema == SCHEMA_LEGACY or "repository" not in data:
        data = dict(data)
        data.setdefault("repository", _repository_name(root))
        data["schema"] = SCHEMA
        for app in data.get("apps") or []:
            if isinstance(app, dict) and "baseline_status" not in app:
                app_id = str(app.get("app_id") or "")
                app["baseline_status"] = _detect_baseline_status(root, app_id) if app_id else "NOT_INITIALIZED"
    return data


def save_registry(repo: str | Path, data: dict[str, Any]) -> Path:
    root = Path(repo).resolve()
    path = root / APPS_REGISTRY_REL
    payload = dict(data)
    payload.setdefault("schema", SCHEMA)
    payload.setdefault("repository", _repository_name(root))
    for app in payload.get("apps") or []:
        if isinstance(app, dict) and "baseline_status" not in app:
            app_id = str(app.get("app_id") or "")
            app["baseline_status"] = _detect_baseline_status(root, app_id) if app_id else "NOT_INITIALIZED"
    _write_json(path, payload)
    return path


def refresh_baseline_statuses(repo: str | Path) -> dict[str, Any] | None:
    """Recompute baseline_status for all apps and persist registry."""
    root = Path(repo).resolve()
    data = load_registry(root)
    if not data:
        return None
    for app in data.get("apps") or []:
        app_id = str(app.get("app_id") or "")
        if app_id:
            app["baseline_status"] = _detect_baseline_status(root, app_id)
    data["schema"] = SCHEMA
    save_registry(root, data)
    return data


def resolve_scope_identifiers(repo: str | Path, specs: list[str] | None) -> list[str]:
    """Normalize --app work / apps/work / apps/work/ to app_id list.

    Raises ValueError with FRONTEND_SCOPE_APP_UNKNOWN when any spec cannot be resolved.
    """
    # @lat: [[frontend-context#Scoped Install]]
    root = Path(repo).resolve()
    registry = load_registry(root) or discover(root, persist=False)
    apps = list(registry.get("apps") or [])
    if not specs:
        return [str(a.get("app_id")) for a in apps if a.get("app_id")]

    by_id = {str(a.get("app_id")): a for a in apps if a.get("app_id")}
    by_root = {_norm(str(a.get("root") or "")): str(a.get("app_id")) for a in apps if a.get("app_id")}
    resolved: list[str] = []
    seen: set[str] = set()
    for raw in specs:
        spec = _norm(str(raw or "").strip())
        if not spec:
            raise ValueError("FRONTEND_SCOPE_APP_UNKNOWN: empty")
        app_id: str | None = None
        if spec in by_id:
            app_id = spec
        elif spec in by_root:
            app_id = by_root[spec]
        else:
            # strip leading apps/ variants already covered by by_root; also try basename
            base = Path(spec).name
            if base in by_id:
                app_id = base
            elif f"apps/{base}" in by_root:
                app_id = by_root[f"apps/{base}"]
        if not app_id:
            raise ValueError(f"FRONTEND_SCOPE_APP_UNKNOWN: {raw}")
        if app_id not in seen:
            seen.add(app_id)
            resolved.append(app_id)
    return resolved


def derive_boundary(
    repo: str | Path,
    app_id: str,
    *,
    registry: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Derive allowed_roots / forbidden_roots for an app (C24)."""
    root = Path(repo).resolve()
    data = registry or load_registry(root) or discover(root, persist=False)
    app = next((a for a in (data.get("apps") or []) if a.get("app_id") == app_id), None)
    if not app:
        raise KeyError(f"unknown app_id: {app_id}")
    app_root = _norm(str(app.get("root") or "."))
    allowed = [app_root] if app_root else ["."]
    for shared in data.get("shared_ui") or []:
        shared_root = _norm(str(shared.get("root") or ""))
        if shared_root and shared_root not in allowed:
            allowed.append(shared_root)
    forbidden: list[str] = []
    for other in data.get("apps") or []:
        other_id = str(other.get("app_id") or "")
        other_root = _norm(str(other.get("root") or ""))
        if other_id and other_id != app_id and other_root and other_root not in {".", ""}:
            forbidden.append(other_root)
    # Forbidden wins on conflict
    allowed = [a for a in allowed if a not in forbidden]
    return {"allowed_roots": allowed, "forbidden_roots": forbidden}


def resolve_shared_components(repo: str | Path) -> dict[str, Any]:
    """Load or discover shared UI component registry (no business surfaces)."""
    root = Path(repo).resolve()
    existing = _read_json(root / SHARED_REGISTRY_REL)
    if existing and existing.get("schema") == SHARED_SCHEMA:
        return existing
    discover(root)
    return _read_json(root / SHARED_REGISTRY_REL) or {
        "schema": SHARED_SCHEMA,
        "packages": [],
    }


def shared_ui_reuse_decision(repo: str | Path, component_name: str) -> dict[str, Any]:
    """Return REUSE when a named shared UI component exists."""
    registry = resolve_shared_components(repo)
    needle = component_name.strip()
    for pkg in registry.get("packages") or []:
        for comp in pkg.get("components") or []:
            if comp.get("name") == needle or needle in str(comp.get("path") or ""):
                return {
                    "decision": "REUSE",
                    "component": comp,
                    "package_id": pkg.get("package_id"),
                    "reason": "SHARED_UI_COMPONENT_FOUND",
                }
    return {
        "decision": "ADD_NEW",
        "component": None,
        "package_id": None,
        "reason": "SHARED_UI_COMPONENT_MISSING",
    }


def cross_app_surface_allowed(source_app: str, target_app: str) -> bool:
    """Surfaces are never shared across apps (monorepo isolation)."""
    _ = (source_app, target_app)
    return False


def component_reuse_automatic(
    source_stack: str,
    target_stack: str,
    *,
    via_shared_package: bool = False,
) -> dict[str, Any]:
    """Component reuse is automatic only for same stack or shared UI package.

    Different stacks still allow UX Pattern Reuse, but not automatic Component Reuse.
    """
    same = bool(source_stack) and source_stack == target_stack
    component = bool(via_shared_package) or same
    return {
        "component_reuse": component,
        "ux_pattern_reuse": True,
        "automatic": component,
        "reason": (
            "SHARED_PACKAGE"
            if via_shared_package
            else ("SAME_STACK" if same else "DIFFERENT_STACK")
        ),
    }


def find_app_for_path(repo: str | Path, rel_path: str) -> str | None:
    """Map a changed path to an owning app_id, or None for shared/unknown."""
    root = Path(repo).resolve()
    registry = load_registry(root) or discover(root)
    norm = _norm(rel_path)
    # shared UI first
    for shared in registry.get("shared_ui") or []:
        shared_root = _norm(str(shared.get("root") or ""))
        if shared_root and (norm == shared_root or norm.startswith(shared_root.rstrip("/") + "/")):
            return None  # shared, not an app
    best: tuple[int, str] | None = None
    for app in registry.get("apps") or []:
        app_root = _norm(str(app.get("root") or ""))
        app_id = str(app.get("app_id") or "")
        if not app_id:
            continue
        if app_root in {".", ""}:
            # root app owns everything that is not another app's prefix
            continue
        if norm == app_root or norm.startswith(app_root.rstrip("/") + "/"):
            score = len(app_root)
            if best is None or score > best[0]:
                best = (score, app_id)
    if best:
        return best[1]
    # single-package electron: src/renderer maps to that app
    for app in registry.get("apps") or []:
        app_root = _norm(str(app.get("root") or ""))
        if app_root.startswith("src/") and norm.startswith("src/"):
            return str(app.get("app_id"))
    return None


def is_shared_ui_path(repo: str | Path, rel_path: str) -> bool:
    root = Path(repo).resolve()
    registry = load_registry(root) or discover(root)
    norm = _norm(rel_path)
    for shared in registry.get("shared_ui") or []:
        shared_root = _norm(str(shared.get("root") or ""))
        if shared_root and (norm == shared_root or norm.startswith(shared_root.rstrip("/") + "/")):
            return True
    # fallback pattern for nested packages/*/ui
    parts = Path(norm).parts
    if len(parts) >= 2 and parts[0] == "packages":
        for part in parts[1:4]:
            if _is_shared_ui_name(part):
                return True
    return False
