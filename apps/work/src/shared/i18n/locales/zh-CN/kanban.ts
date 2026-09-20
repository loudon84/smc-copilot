export default {
  title: "看板",
  subtitle: "持久化多代理任务面板，代理可自行领取并完成任务。",

  // Header actions
  refresh: "刷新",
  refreshTooltip: "从代理重新加载看板与任务",
  dispatch: "派发",
  dispatchTooltip: "执行一轮派发 — 将就绪任务升级并启动工作代理",
  newTask: "新建任务",
  newTaskTooltip: "在当前看板上创建新任务",
  newBoard: "新建看板",
  newBoardTooltip: "创建新的看板",
  showArchived: "显示已归档",
  hideArchived: "隐藏已归档",
  archivedTooltip: "切换已归档列",

  // Remote-mode unsupported notice
  remoteUnsupportedTitle: "看板需要本地安装 Hermes 或 SSH 隧道模式。",
  remoteUnsupportedHint:
    "纯远程（HTTP + API Key）模式尚未开放看板 API。请在设置中切换到本地或 SSH 隧道模式来管理看板。",

  // Column / task statuses
  status: {
    triage: "分类",
    todo: "待办",
    scheduled: "已计划",
    ready: "就绪",
    running: "执行中",
    blocked: "已阻塞",
    review: "审查",
    done: "完成",
    archived: "已归档",
  },

  // Card action tooltips
  cardSpecify: "细化（展开规格 → 待办）",
  cardMarkDone: "标记完成",
  cardReclaim: "回收工作代理",
  cardUnblock: "解除阻塞",
  cardBlock: "阻塞",
  cardArchive: "归档",

  // Create-task modal
  createTitle: "新建看板任务",
  fieldTitle: "标题",
  titlePlaceholder: "需要完成什么？",
  fieldBody: "内容（可选）",
  bodyPlaceholder: "上下文、验收条件、链接…",
  fieldAssignee: "指派代理",
  assigneeNone: "— 分类（不指派）",
  fieldPriority: "优先级",
  priorityNormal: "普通 (0)",
  priorityLow: "低 (P2)",
  priorityHigh: "高 (P1)",
  priorityUrgent: "紧急 (P0)",
  fieldWorkspace: "工作区",
  workspaceScratch: "暂存（临时目录）",
  workspaceWorktree: "Worktree（当前仓库）",
  workspaceChoose: "选择文件夹…",
  workspaceNoFolder: "尚未选择文件夹",
  browse: "浏览…",
  triageCheckbox: "先放到分类（由细化器展开规格后再升级到待办）",
  create: "创建任务",
  creating: "创建中…",

  // New-board modal
  newBoardTitle: "新建看板",
  fieldSlug: "标识",
  slugPlaceholder: "kebab-case，例如 atm10-server",
  fieldDisplayName: "显示名称（可选）",
  displayNamePlaceholder: "ATM10 Server",
  createBoard: "创建看板",

  // Task-detail modal
  detailFallbackTitle: "任务",
  detailBody: "内容",
  detailSummary: "最近一次执行摘要",
  detailResult: "结果",
  detailComments: "评论 ({{count}})",
  detailEvents: "事件 ({{count}})",
  commentAnon: "匿名",

  // Prompts / confirmations
  blockReasonPrompt: "阻塞原因？",
  confirmMarkDone: "将「{{title}}」标记为完成？",
  confirmArchive: "归档「{{title}}」？",

  // Errors
  moveNotAllowed: "无法从桌面端将 {{from}} → {{to}}。请使用代理或 CLI。",
  errLoadBoards: "加载看板失败",
  errLoadTasks: "加载任务失败",
  errMoveTask: "移动任务失败",
  errPickFolder: "请先选择工作区文件夹。",
  errCreateTask: "创建任务失败",
  errSwitchBoard: "切换看板失败",
  errCreateBoard: "创建看板失败",
  errSpecify: "细化任务失败",
  errArchive: "归档任务失败",
  errReclaim: "回收失败",
  errDispatch: "派发失败",

  // Tooltips & buttons
  hqBoardTooltip: "Claw3D 总部看板（只读镜像）",
  dismissError: "关闭错误",
  closeTaskDetails: "关闭任务详情",
} as const;
