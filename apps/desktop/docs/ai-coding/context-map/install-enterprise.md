# Context Map — 企业安装与 Runtime 布局

## 流水线

```text
Install UI → enterprise:* IPC → enterprise-installer.ts（20 步）
  → agent-deps-installer / pip-mirror-config
  → profile bootstrap → marker
```

## 关键路径

| 模块 | 路径 |
|------|------|
| 企业安装 | `src/main/enterprise/enterprise-installer.ts` |
| 依赖安装 | `src/main/enterprise/agent-deps-installer.ts` |
| PyPI 镜像 | `src/main/enterprise/pip-mirror-config.ts` |
| 预检读取 | `src/main/enterprise/installer-precheck-reader.ts` |
| 运行时路径 | `src/main/runtime/runtime-paths.ts` |
| Portal 根 | `src/main/runtime/portal-root-resolver.ts` |
| 安装目录 | `install-location-resolver.ts` |

## V5.3+ 标准布局

```text
$INSTDIR/desktop.exe
$INSTDIR/runtime/hermes/{src,venv,logs}
$INSTDIR/runtime/serve/{src,venv,.env,logs}
$INSTDIR/runtime/portal/{src,node_modules,.env.local,logs}
$INSTDIR/bin/*.cmd
```

用户数据：`%USERPROFILE%\.hermes\`

## 配置落盘

- `$INSTDIR/runtime/desktop-runtime.json` — pipMirror、agentSource
- `$INSTDIR/runtime/deployment.json` — 企业部署默认
- NSIS 预检：`runtime/installer-precheck.json`

## UI 入口

- `src/renderer/src/screens/Install/`
- Welcome / Setup 向导

## 文档

- `AGENTS.md` § Enterprise Install
- `docs/ARCHITECTURE.md`
- PRD：`prd/v1.2.1_*`、`prd/v5.3_*`、`prd/v5.4_*`

## 安全约束

仅 127.0.0.1、Token 不落盘、默认不写系统 PATH。
