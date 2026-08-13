from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTENSIONS = ROOT / "extensions"
FORBIDDEN = re.compile(
    r"^\s*(from\s+_utils\b|from\s+\.|import\s+_utils\b|sys\.path\.(insert|append))",
    re.M,
)


def test_extensions_have_no_package_or_relative_imports() -> None:
    offenders: list[str] = []
    for path in EXTENSIONS.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if FORBIDDEN.search(text):
            offenders.append(str(path.relative_to(ROOT)))
        if "sys.path.insert" in text or "sys.path.append" in text:
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == []


def test_utils_directory_is_not_a_python_package() -> None:
    assert not (EXTENSIONS / "_utils" / "__init__.py").exists()
    assert not (EXTENSIONS / "_utils" / "dunder.py").exists()


def test_public_utils_filenames_match_loader_names() -> None:
    names = {path.stem for path in (EXTENSIONS / "_utils").glob("*.py")}
    assert names == {
        "smc_paths",
        "smc_control_owner",
        "smc_redact",
        "smc_artifact",
        "config_revision",
        "smc_handover_hooks",
    }
