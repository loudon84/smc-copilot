# Runtime Acceptance — v1.3.1 Hotfix

Windows 真实 Hermes 闭环验收（在 v1.3 之上）。详细 DoD 见 `prd/ver1.3.1.md` §21。

## Checklist

- [ ] 无生产 Stub Hermes
- [ ] 真实 Artifact 可安装；`hermes --version` 非 stub
- [ ] `hermes doctor`（无 `--json`）通过
- [ ] Gateway：`--external-supervisor`；无 `--profile`/`--port`
- [ ] 默认 Profile 写 `~/.hermes/`；命名写 `profiles/<name>/`
- [ ] Instance 启停不依赖 `profiles` 表；autostart + reboot reconcile
- [ ] Secret：DPAPI；注入 Gateway；health/logs 无密钥
- [ ] `.cmd` Bypass 安装；`-PythonPath` 全链路；Provision → smoke → UserDaemon
- [ ] `pytest` + `ruff` 通过

## 自动化回归

```text
tests/test_real_artifact_install.py
tests/test_gateway_command_contract.py
tests/test_profile_paths.py
tests/test_instance_gateway_supervisor.py
tests/test_gateway_secret_environment.py
tests/test_windows_bootstrap_contract.py
```

人工：`scripts/runtime-provision-windows.cmd` + `runtime-smoke-test-windows.ps1 -RequireHermes -RequireGateway`。
