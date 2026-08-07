# Install and runtime layout

Windows deployment uses NSIS for the shell binary and Electron Bootstrap for Python/Git/venv work. Canonical runtime folders are `hermes`, `serve`, and `portal` under `$INSTDIR/runtime/`.

Related architecture: [[architecture#External runtimes]], [[domain/gateway#Gateway lifecycle]].

## Runtime layout

Canonical install identity is SMC-Copilot / `desktop.exe`. Runtime tree:

```text
$INSTDIR/desktop.exe
$INSTDIR/runtime/hermes/{src,venv,logs}
$INSTDIR/runtime/serve/{src,venv,.env,logs}
$INSTDIR/runtime/portal/{src,node_modules,.env.local,logs}
$INSTDIR/bin/*.cmd
```

Legacy folder names are read fallbacks only. Path resolution centralizes in `runtime-paths` / portal-root-resolver; do not invent parallel path logic.

## Bootstrap vs NSIS

NSIS places files and optional PATH entries. Long Python dependency installs run in Electron Bootstrap UI with progress/logs — not inside the NSIS script. Secrets must not ship in `electron-builder.yml` or packaged `.env`.

## Pip mirror and agent source

User zip / Git agent sources and PyPI mirror presets flow through installer IPC into `desktop-runtime.json`. Prefer `uv --no-config` with requirements; offline wheels when present; pip fallback with trusted-host settings.
