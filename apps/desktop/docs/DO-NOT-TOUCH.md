# Do Not Touch Without Explicit Approval

## 全局配置

- `electron-builder.yml` — 打包配置（appId, publish, NSIS）
- `electron.vite.config.ts` — 构建配置（external, alias, plugins）
- `package.json` — 依赖版本、scripts
- `tsconfig.json` / `tsconfig.node.json` / `tsconfig.web.json` — TypeScript 配置

## 进程通信核心

- `src/preload/index.ts` — 预加载桥接层（所有 IPC 通信的咽喉，暴露 hermesAPI + aiosBrowser + profileRuntime + profileEntry + aiosRuntime）
- `src/preload/index.d.ts` — 类型声明（API 契约）
- `src/main/index.ts` — 主进程入口（IPC 注册中心）

## Gateway 管理

- `src/main/hermes.ts` — Gateway 启动/停止/消息路由（最核心模块）
- `src/main/sse-parser.ts` — SSE 解析器（聊天流依赖）

## Profile Runtime 核心

- `src/main/profile-runtime-manager.ts` — Profile 生命周期编排（启动/停止/重启/端口冲突/启动超时）
- `src/main/profile-runtime-db.ts` — SQLite 控制面（9 表，运行时状态核心）
- `src/main/profile-runtime-ipc.ts` — Profile Runtime IPC 注册（19+ 个通道）
- `src/main/gateway-supervisor.ts` — 健康监管 + 自动重启逻辑
- `src/main/runtime-reconciler.ts` — App 重启后状态恢复

## Portal Runtime 核心

- `src/main/aios/aios-ipc.ts` — Portal IPC 注册（14 个通道）
- `src/main/aios/aios-runtime-supervisor.ts` — Portal 运行时监管
- `src/main/aios/aios-reconciler.ts` — Portal 状态恢复
- `src/main/aios/aios-process.ts` — Portal 进程管理
- `src/preload/aios-api.ts` — Portal Preload API

## 共享模块

- `src/shared/i18n/config.ts` — i18n 配置（语言代码、回退链）
- `src/shared/i18n/types.ts` — i18n 类型定义
- `src/shared/enterprise/enterprise-constants.ts` — V1.2.1 Enterprise 枚举/错误码/常量（32 错误码，20 InstallStage）
- `src/shared/enterprise/enterprise-schema.ts` — V1.2.1 Enterprise 数据结构类型（DeploymentConfig 31 字段）
- `src/shared/enterprise/enterprise-contract.ts` — V1.2.1 Enterprise API 契约（EnterpriseInstallAPI 13 方法）
- `src/shared/profile-runtime/profile-runtime-contract.ts` — Profile Runtime 类型定义（115+ 接口/类型/枚举）
- `src/shared/profile-runtime/profile-runtime-errors.ts` — Profile Runtime 错误码（19 个）
- `src/shared/aios/aios-contract.ts` — Portal API 契约

## Enterprise Install 核心

- `src/main/enterprise/enterprise-installer.ts` — 安装流水线编排 + IPC 注册（影响全部 enterprise IPC 通道）
- `src/main/enterprise/deployment-schema.ts` — Deployment Schema 校验（影响配置合法性判断）
- `src/main/enterprise/preflight-checker.ts` — 环境预检（20 项检查影响安装阻断逻辑）
- `src/main/enterprise/agent-deps-installer.ts` — V1.4.1 依赖安装（uv/pip/镜像/wheelhouse）
- `src/main/enterprise/pip-mirror-config.ts` — V1.4.1 PyPI 镜像配置解析

## DB 迁移

- `src/main/migrations/migration-runner.ts` — 迁移运行器（影响数据库版本管理）

## 构建资源

- `build/` — 图标、entitlements、winget 模板、NSIS 脚本

## 原因

这些文件影响全局行为：
- preload 层变更影响所有进程通信
- 主进程入口变更影响所有 IPC 注册
- Gateway 管理变更影响消息收发和进程生命周期
- 构建配置变更影响打包产物和自动更新
- i18n 配置变更影响所有语言的加载
- Enterprise 契约变更影响安装流水线和 IPC 通信
- 安装流水线变更影响企业部署完整性和安全性
- Profile Runtime 核心变更影响多实例运行时和 Gateway 生命周期
- Portal Runtime 核心变更影响 Portal 运行时管理
- 迁移运行器变更影响数据库版本兼容性

任何修改需要明确理解影响范围并获得批准。
