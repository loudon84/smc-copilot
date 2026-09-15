"""Stack classifier for frontend applications (static signals only)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ADAPTERS = (
    "react-web",
    "react-electron",
    "vue3-web",
    "nextjs",
    "nuxt",
    "react-native",
    "generic",
)


def _read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _deps(pkg: dict[str, Any]) -> set[str]:
    names: set[str] = set()
    for key in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
        block = pkg.get(key) or {}
        if isinstance(block, dict):
            names.update(str(k) for k in block.keys())
    return names


def _has_config(app_root: Path, *names: str) -> bool:
    for name in names:
        if (app_root / name).is_file():
            return True
        # allow common variants under app root
        for path in app_root.glob(name):
            if path.is_file():
                return True
    return False


# @lat: [[frontend-context#Stack Classifier]]
def classify(repo: str | Path, app_root: str | Path) -> dict[str, Any]:
    """Classify an app root into a stack_adapter key and runtime hints."""
    root = Path(repo).resolve()
    base = Path(app_root)
    if not base.is_absolute():
        base = (root / base).resolve()
    pkg = _read_json(base / "package.json")
    if not pkg and (root / "package.json").is_file():
        # single-package electron: package.json may live at repo root
        pkg = _read_json(root / "package.json")
    deps = _deps(pkg)

    has_react = "react" in deps
    has_vue = "vue" in deps or "vue" in {d.split("/")[0] for d in deps}
    has_electron = "electron" in deps
    has_next = "next" in deps or _has_config(base, "next.config.js", "next.config.mjs", "next.config.ts")
    has_nuxt = "nuxt" in deps or _has_config(base, "nuxt.config.js", "nuxt.config.ts", "nuxt.config.mjs")
    has_rn = "react-native" in deps
    has_vite = _has_config(
        base,
        "vite.config.js",
        "vite.config.ts",
        "vite.config.mjs",
        "vite.config.cts",
    ) or "vite" in deps

    renderer = (root / "src" / "renderer").is_dir() or (base / "src" / "renderer").is_dir()
    main_proc = (root / "src" / "main").is_dir() or (base / "src" / "main").is_dir()

    stack = "generic"
    framework = "unknown"
    runtime = "browser"

    if has_rn:
        stack = "react-native"
        framework = "react-native"
        runtime = "react-native"
    elif has_next:
        stack = "nextjs"
        framework = "react"
        runtime = "browser"
    elif has_nuxt:
        stack = "nuxt"
        framework = "vue3"
        runtime = "browser"
    elif has_electron or (renderer and (main_proc or has_react)):
        if has_react or renderer:
            stack = "react-electron"
            framework = "react"
            runtime = "electron-renderer"
        else:
            stack = "generic"
            framework = "unknown"
            runtime = "electron"
    elif has_vue:
        stack = "vue3-web"
        framework = "vue3"
        runtime = "browser"
    elif has_react:
        stack = "react-web"
        framework = "react"
        runtime = "browser"

    try:
        app_root_rel = str(base.relative_to(root)).replace("\\", "/")
    except ValueError:
        app_root_rel = str(base).replace("\\", "/")

    return {
        "schema": "smc.ges.stack-classify.v1",
        "app_root": app_root_rel,
        "stack_adapter": stack,
        "framework": framework,
        "runtime": runtime,
        "signals": {
            "react": has_react,
            "vue": has_vue,
            "electron": has_electron or renderer,
            "next": has_next,
            "nuxt": has_nuxt,
            "react_native": has_rn,
            "vite": has_vite,
        },
    }
