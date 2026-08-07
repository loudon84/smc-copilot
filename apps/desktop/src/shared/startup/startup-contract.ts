import type { RuntimeState } from "../enterprise/runtime-state-contract";

/**
 * Startup Gate - 启动路由决策契约
 *
 * 定义应用启动时的路由决策类型，由 Main Process 计算，Renderer 消费。
 * 这是确保"更新后直接进入主页"硬性验收项的核心类型。
 */

/** 启动后应进入的屏幕 */
export type StartupScreen = "login" | "main" | "welcome" | "installing" | "setup";

/** 启动决策的原因，用于诊断和日志 */
export type StartupDecisionReason =
  | "auth-required"
  | "bootstrap-pending"
  | "runtime-ready-model-configured"
  | "runtime-ready-model-missing"
  | "runtime-missing"
  | "remote-ready"
  | "ssh-ready"
  | "remote-unreachable"
  | "ssh-unreachable";

/** 连接模式 */
export type ConnectionMode = "local" | "remote" | "ssh";

/**
 * 启动决策结果
 *
 * 由 Main Process 的 resolveStartupDecision() 返回，
 * 作为 Renderer 启动路由的唯一依据。
 */
export interface StartupDecision {
  /** 运行时状态（本地模式时存在） */
  runtime: RuntimeState | null;

  /** 连接模式 */
  connectionMode: ConnectionMode;

  /** 下一个应显示的屏幕 */
  nextScreen: StartupScreen;

  /** 是否跳过 Agent 安装 */
  skipAgentInstall: boolean;

  /** 是否跳过模型配置 */
  skipModelSetup: boolean;

  /** 是否应在后台验证安装 */
  shouldVerifyInBackground: boolean;

  /** 决策原因 */
  reason: StartupDecisionReason;

  /** 错误信息（如果有） */
  error?: string;
}
