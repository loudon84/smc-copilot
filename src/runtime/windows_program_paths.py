from __future__ import annotations

import sys
from pathlib import Path

# 企业 Windows：程序源码与 venv 必须在 D:\Programs 下。
# 服务态（Runtime DB/日志/staging）仍用 %LOCALAPPDATA%\HermesRuntime，不改动。
WINDOWS_PROGRAMS_ROOT = Path(r"D:\Programs")
DEFAULT_HERMES_INSTALL_DIR = WINDOWS_PROGRAMS_ROOT / "HermesAgent"
DEFAULT_COPILOT_SERVE_DIR = WINDOWS_PROGRAMS_ROOT / "copilot-serve"


def is_windows() -> bool:
    return sys.platform == "win32"


def default_hermes_install_dir() -> Path | None:
    """Windows 默认 Hermes 版本安装根；其它平台返回 None（改用 Runtime versions/）。"""
    if is_windows():
        return DEFAULT_HERMES_INSTALL_DIR
    return None


def is_under_programs_root(path: Path) -> bool:
    """判断 path 是否位于 D:\\Programs 下（含自身）。"""
    try:
        resolved = path.expanduser().resolve()
        root = WINDOWS_PROGRAMS_ROOT.resolve()
        return resolved == root or root in resolved.parents
    except OSError:
        return False


def require_under_programs_root(path: Path, *, label: str) -> Path:
    from core.runtime_errors import RuntimeServiceError

    resolved = path.expanduser().resolve()
    if not is_under_programs_root(resolved):
        raise RuntimeServiceError(
            f"{label} 必须位于 {WINDOWS_PROGRAMS_ROOT} 下，当前为: {resolved}",
            code="validation_error",
            details={"path": str(resolved), "requiredRoot": str(WINDOWS_PROGRAMS_ROOT)},
        )
    return resolved
