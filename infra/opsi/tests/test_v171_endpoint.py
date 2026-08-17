from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

PRODUCT = Path(__file__).resolve().parents[1] / "products" / "smc-hermes-agent"


def _lifecycle():
    sys.path.insert(0, str(PRODUCT))
    from controller import lifecycle

    return lifecycle


class FakeRun:
    def __init__(self, version: str = "0.20.2") -> None:
        self.version = version
        self.commands: list[list[str]] = []

    def __call__(self, cmd, capture_output=True, text=True, check=False):  # noqa: ANN001
        self.commands.append([str(part) for part in cmd])
        joined = " ".join(str(part) for part in cmd)
        if "-m venv" in joined:
            venv = Path(cmd[-1])
            scripts = venv / "Scripts"
            scripts.mkdir(parents=True, exist_ok=True)
            (scripts / "python.exe").write_bytes(b"py")
            (scripts / "hermes.exe").write_text(self.version, encoding="utf-8")
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        if "pip" in joined:
            assert "--no-index" in joined
            assert "pypi.org" not in joined.lower()
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        if "--version" in joined:
            return SimpleNamespace(returncode=0, stdout=f"{self.version}\n", stderr="")
        if "gateway" in joined:
            return SimpleNamespace(returncode=0, stdout="ok\n", stderr="")
        return SimpleNamespace(returncode=0, stdout="", stderr="")


def _wheelhouse_extract(root: Path, version: str = "0.20.2") -> tuple[Path, list[dict[str, str]]]:
    extract = root / "extract"
    app = extract / "app"
    wheels = extract / "python" / "wheels"
    app.mkdir(parents=True)
    wheels.mkdir(parents=True)
    hermes = app / f"hermes_agent-{version}-py3-none-any.whl"
    dep = wheels / "pydantic-2.11.0-py3-none-any.whl"
    hermes.write_bytes(b"wheel")
    dep.write_bytes(b"dep")
    files = []
    for path in (hermes, dep):
        rel = path.relative_to(extract).as_posix()
        files.append(
            {
                "path": rel,
                "size": str(path.stat().st_size),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
        )
    return extract, files


def test_e01_python_312_x64_passes():
    lc = _lifecycle()
    lc.check_python_prerequisite(executable="python", version="3.12.10", architecture="AMD64", required=">=3.12,<3.13")


def test_e02_python_missing_fails():
    lc = _lifecycle()
    with pytest.raises(lc.PrerequisiteFailed, match="PREREQUISITE_FAILED"):
        lc.check_python_prerequisite(executable=None, version="", architecture="amd64", required=">=3.12,<3.13")


def test_e03_wrong_python_version_and_arch_fail():
    lc = _lifecycle()
    with pytest.raises(lc.PrerequisiteFailed, match="PREREQUISITE_FAILED"):
        lc.check_python_prerequisite(executable="python", version="3.11.9", architecture="amd64", required=">=3.12,<3.13")
    with pytest.raises(lc.PrerequisiteFailed, match="PREREQUISITE_FAILED"):
        lc.check_python_prerequisite(executable="python", version="3.13.0", architecture="amd64", required=">=3.12,<3.13")
    with pytest.raises(lc.PrerequisiteFailed, match="architecture"):
        lc.check_python_prerequisite(executable="python", version="3.12.1", architecture="x86", required=">=3.12,<3.13")


def test_e04_node_22_passes():
    lc = _lifecycle()
    lc.check_node_prerequisite(executable="node", version="v22.14.0", required=">=22,<23")


def test_e05_wrong_node_version_fails():
    lc = _lifecycle()
    with pytest.raises(lc.PrerequisiteFailed, match="PREREQUISITE_FAILED"):
        lc.check_node_prerequisite(executable="node", version="v20.11.0", required=">=22,<23")


def test_e06_create_fresh_venv(tmp_path: Path):
    lc = _lifecycle()
    runner = FakeRun()
    venv = lc.create_runtime_venv("python", tmp_path / "slot", runner=runner)
    assert (venv / "Scripts" / "python.exe").is_file()
    assert any("-m" in cmd and "venv" in cmd for cmd in [" ".join(c) for c in runner.commands])


def test_e07_offline_wheel_install_uses_no_index(tmp_path: Path):
    lc = _lifecycle()
    args = lc.offline_pip_args("python", tmp_path / "wheels", tmp_path / "app" / "hermes.whl")
    assert "--no-index" in args
    assert "--find-links" in args
    assert not any("pypi.org" in part.lower() for part in args)


def test_e08_e09_e10_wheelhouse_slot_cli_and_gateway(tmp_path: Path):
    lc = _lifecycle()
    layout = lc.fake_programdata(tmp_path / "programdata")
    extract, files = _wheelhouse_extract(tmp_path)
    digest = hashlib.sha256(b"bundle").hexdigest()
    runner = FakeRun("0.20.2")
    slot = lc.install_runtime_slot(
        layout,
        extract,
        "0.20.2",
        digest,
        files,
        install_type="python-wheelhouse",
        runtime_entrypoint="venv/Scripts/hermes.exe",
        requires={"python": ">=3.12,<3.13", "node": ">=22,<23"},
        python_exe="python",
        python_version="3.12.10",
        python_arch="amd64",
        node_exe="node",
        node_version="22.14.0",
        runner=runner,
    )
    pointer = json.loads(layout.active_runtime.read_text(encoding="utf-8"))
    assert pointer["entrypoint"] == "venv/Scripts/hermes.exe"
    assert pointer["active"] == str(slot)
    pip_cmds = [cmd for cmd in runner.commands if "pip" in cmd]
    assert pip_cmds
    assert "--no-index" in pip_cmds[0]
    assert not any("pypi.org" in " ".join(cmd).lower() for cmd in runner.commands)
    cli = lc.resolve_active_cli(layout, "venv/Scripts/hermes.exe")
    assert cli.name == "hermes.exe"
    assert any("--version" in cmd for cmd in runner.commands)
    assert any("gateway" in cmd for cmd in runner.commands)


def test_wheelhouse_failure_does_not_commit_active(tmp_path: Path):
    lc = _lifecycle()
    layout = lc.fake_programdata(tmp_path / "programdata")
    extract, files = _wheelhouse_extract(tmp_path)
    digest = hashlib.sha256(b"bundle").hexdigest()
    with pytest.raises(lc.PrerequisiteFailed):
        lc.install_runtime_slot(
            layout,
            extract,
            "0.20.2",
            digest,
            files,
            install_type="python-wheelhouse",
            runtime_entrypoint="venv/Scripts/hermes.exe",
            python_exe=None,
            python_version="",
            python_arch="amd64",
            node_exe="node",
            node_version="22.14.0",
        )
    assert not layout.active_runtime.is_file()


def test_scripts_declare_prereq_and_offline_install():
    controller = (PRODUCT / "controller" / "SmcController.psm1").read_text(encoding="utf-8")
    assert "PREREQUISITE_FAILED" in controller
    assert "--no-index" in controller
    assert "python-wheelhouse" in controller
    install = (PRODUCT / "scripts" / "install" / "Install-Hermes.ps1").read_text(encoding="utf-8")
    assert "runtimeEntrypoint" in install
    assert "InstallType" in install
    assert "cliSha256" in install
