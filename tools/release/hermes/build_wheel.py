"""Build the Hermes wheel from a frozen source tree."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


def build_wheel(repo: Path, dest: Path) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    uv = shutil.which("uv")
    if uv:
        cmd = [uv, "build", "--wheel", "--out-dir", str(dest)]
    else:
        cmd = ["python", "-m", "build", "--wheel", "--outdir", str(dest)]
    result = subprocess.run(cmd, cwd=repo, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise ValueError(result.stderr.strip() or result.stdout.strip() or "wheel build failed")
    wheels = sorted(dest.glob("hermes_agent-*.whl")) or sorted(dest.glob("*.whl"))
    if not wheels:
        raise ValueError("hermes wheel missing after build")
    return wheels[-1]
