# -*- mode: python ; coding: utf-8 -*-
# PyInstaller onefile spec for production Runtime Launcher (PRD v1.6 FR-002).
# Build: pyinstaller build/runtime-launcher.spec

import sys
from pathlib import Path

block_cipher = None
repo = Path(SPECPATH).resolve().parent
launcher = repo / "src" / "local_service" / "runtime_launcher.py"

a = Analysis(
    [str(launcher)],
    pathex=[str(repo / "src")],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "unittest", "pytest"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="CopilotRuntime",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
