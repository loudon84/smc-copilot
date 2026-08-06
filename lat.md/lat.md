This directory defines the high-level concepts, business logic, and architecture of this project using markdown. It is managed by [lat.md](https://www.npmjs.com/package/lat.md) — a tool that anchors source code to these definitions. Install the `lat` command with `npm i -g lat.md` and run `lat --help`.

## 知识图谱入口

`smc-copilot-serve` 是本机常驻 Hermes Runtime Service。各文件按主题组织，源码以 `// @lat:` 反向引用对应小节。

- [[index]] — 项目概览、系统边界、技术栈与文档导航
- [[architecture]] — 分层职责、应用装配、生命周期与后台循环
- [[runtime-service]] — 版本管理、安装/更新/回滚、Job 队列、环境探测、目录布局
- [[gateway-supervisor]] — Gateway 进程生命周期、端口、健康、重协调、孤儿清理
- [[profiles-instances]] — Profile 服务、Instance、角色编译、能力协商
- [[task-runtime]] — 任务状态机、路由、Team Hub（Deprecated）、Remote Task v2、Outbox、后台 Worker
- [[approval-workspace]] — 审批运行时、Workspace Guard、可执行策略
- [[auth-pairing]] — 本地鉴权、设备配对、遗留 Token 兼容
- [[chat-sessions]] — Workspace Chat、Chat SSE 流、附件、Session
- [[deployment]] — Windows 用户级后台/服务、程序目录约束、跨平台、目录布局
- [[data-model]] — Runtime 表、Profile 与任务表、迁移链
- [[endpoint-sync]] — Endpoint 身份、Sync、Desired State、Remote Task v2、Experience
- [[design-decisions]] — 本地优先、服务态隔离、Hermes 外部化、风险门控、失败不破坏现状
- [[tests]] — 关键测试覆盖区域
