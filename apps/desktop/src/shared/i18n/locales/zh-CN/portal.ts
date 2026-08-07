export default {
  noServices: "尚未检测到运行时服务",
  webAppPlaceholder: "Portal Web 应用将在运行时就绪后加载于此。",
  webAppHint: "Portal 前端通过本地 WebContentsView 提供，所有服务运行后自动挂载。",
  loadingRuntime: "正在检查 Portal 运行时…",
  supervisorFrontendDown:
    "桌面托管的 Portal 前端未运行，仍将加载您配置的门户 URL。",
  portalUnreachable:
    "无法访问登录配置的 Portal Home URL：{{url}}。请先启动本地 frontend（如 pnpm dev）或检查登录端点。",
  openRuntimeSettings: "运行时设置",
  portalRuntimeTitle: "Portal 运行时",
  portalRuntimeHint:
    "Portal Backend（:8000）与 Frontend（:3000）独立于 Hermes Gateway。桌面可托管启动；开发时也可在 monorepo 根目录执行 pnpm dev。需 PostgreSQL（默认 127.0.0.1:55432）。",
  portalRuntimeApiMissing: "aiosRuntime API 不可用（preload 未加载）",
  startPortal: "启动 Portal",
  startingPortal: "启动中…",
  stopPortal: "停止",
  restartPortal: "重启",
  portalDoctor: "诊断",
  portalInstallStatusLabel: "安装状态",
  portalInstalled: "已安装",
  portalNotInstalled: "未安装",
  portalRootLabel: "Monorepo 根目录",
  portalNotInstalledHint:
    "请运行 build/scripts/deploy-copilot-serve.ps1 将 Portal 部署到 runtime/portal/src，或将用户环境变量 COPILOT_PORTAL_ROOT 指向有效 monorepo（含 package.json、backend/、frontend/）。部署后需重启桌面应用。",
} as const;
