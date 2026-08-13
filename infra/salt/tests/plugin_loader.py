"""Load Salt _utils plugins as independent modules — no _utils package, no sys.path mutation."""

from __future__ import annotations

import importlib.util
from collections.abc import Callable
from pathlib import Path
from types import ModuleType
from typing import Any

EXTENSIONS = Path(__file__).resolve().parents[1] / "extensions"
UTILS_DIR = EXTENSIONS / "_utils"
PUBLIC_UTILS = (
    "smc_paths",
    "smc_control_owner",
    "smc_redact",
    "smc_artifact",
    "config_revision",
    "smc_handover_hooks",
)


def load_plugin(path: Path) -> ModuleType:
    name = f"salt_plugin_{path.stem}_{abs(hash(str(path.resolve())))}"
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load plugin {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_named_util(name: str) -> ModuleType:
    return load_plugin(UTILS_DIR / f"{name}.py")


def build_utils_map() -> dict[str, Callable[..., Any]]:
    mapping: dict[str, Callable[..., Any]] = {}
    for name in PUBLIC_UTILS:
        path = UTILS_DIR / f"{name}.py"
        if not path.is_file():
            continue
        module = load_plugin(path)
        for attr, obj in vars(module).items():
            if attr.startswith("_") or not callable(obj):
                continue
            mapping[f"{name}.{attr}"] = obj
    return mapping
