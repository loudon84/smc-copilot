"""Tests for production Runtime Launcher (PRD v1.6 FR-002)."""

from __future__ import annotations

from pathlib import Path

from local_service.runtime_launcher import (
    EXIT_OK,
    EXIT_PYTHON_MISSING,
    build_env,
    locate_python,
    main,
    resolve_install_root,
)


# @lat: [[tests#验收#Runtime launcher resolves install root]]
def test_launcher_version_flag() -> None:
    assert main(["--version"]) == EXIT_OK


def test_resolve_install_root_explicit(tmp_path: Path) -> None:
    assert resolve_install_root(str(tmp_path)) == tmp_path.resolve()


def test_locate_python_falls_back_to_sys(tmp_path: Path) -> None:
    py = locate_python(tmp_path)
    assert py.is_file()


def test_build_env_injects_pythonpath(tmp_path: Path) -> None:
    (tmp_path / "runtime" / "src").mkdir(parents=True)
    (tmp_path / "site-packages").mkdir()
    env = build_env(tmp_path)
    assert "runtime" in env["PYTHONPATH"]
    assert env["AIOS_RUNTIME_INSTALL_ROOT"] == str(tmp_path)


def test_start_fails_without_python(tmp_path: Path, monkeypatch) -> None:
    import local_service.runtime_launcher as rl

    monkeypatch.setattr(rl, "locate_python", lambda root: (_ for _ in ()).throw(FileNotFoundError()))
    assert rl.start_runtime(tmp_path) == EXIT_PYTHON_MISSING
