from __future__ import annotations

import traceback

from _modules import smc_hermes
from plugin_loader import PUBLIC_UTILS, UTILS_DIR, build_utils_map, load_plugin


def test_utils_load_independently_without_package() -> None:
    loaded = []
    for path in sorted(UTILS_DIR.glob("*.py")):
        if path.name.startswith("_"):
            continue
        module = load_plugin(path)
        assert module is not None
        loaded.append(path.stem)
    for name in PUBLIC_UTILS:
        assert name in loaded, f"missing public util {name}"
    assert "__init__" not in loaded
    assert "dunder" not in loaded
    assert "paths" not in loaded
    assert "artifact" not in loaded


def test_loader_status_with_injected_utils(inject_salt_utils) -> None:
    smc_hermes.__utils__ = inject_salt_utils
    status = smc_hermes.loader_status()
    assert status["missing"] == []
    assert status["ok"] is True
    assert "smc_paths.layout" in status["available"]


def test_missing_utils_returns_stable_diagnostic_not_module_not_found() -> None:
    smc_hermes.__utils__ = {}
    status = smc_hermes.loader_status()
    assert status["error"] == "smc_utils_unavailable"
    assert status["missing"]
    inspect = smc_hermes.inspect()
    doctor = smc_hermes.doctor()
    assert inspect["error"] == "smc_utils_unavailable"
    assert doctor["error"] == "smc_utils_unavailable"
    dumped = traceback.format_stack()
    joined = "\n".join(dumped) + str(inspect) + str(doctor)
    assert "ModuleNotFoundError" not in joined
    assert "No module named '_utils'" not in joined
    assert inspect.get("error") == "smc_utils_unavailable"


def test_build_utils_map_uses_public_names() -> None:
    mapping = build_utils_map()
    assert "smc_paths.layout" in mapping
    assert "smc_artifact.install_signed" in mapping
    assert "config_revision.apply_config" in mapping
    assert "smc_redact.mapping" in mapping
