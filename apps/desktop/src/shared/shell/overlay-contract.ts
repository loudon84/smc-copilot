/**
 * Overlay 契约类型
 *
 * 定义 Modal / Dropdown 的核心类型，支持队列、优先级和透明背景。
 */

/** Modal Key - 预定义的 Modal 类型 */
export type ShellModalKey =
  | "update-ready"
  | "confirm-exit"
  | "error-report"
  | "permission-request"
  | "custom-dialog"
  | "custom";

/** Dropdown Key - 预定义的 Dropdown 类型（用于 IPC 桥接） */
export type ShellDropdownKey =
  | "gateway-status"
  | "profile-switcher"
  | "model-selector"
  | "quick-actions";

/** Overlay 层级 - 用于 z-index 管理 */
export type OverlayLayer = "modal" | "dropdown" | "tooltip";

/** Overlay Bounds（像素值） */
export interface OverlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Overlay Layout（支持百分比和 calc 表达式） */
export interface OverlayLayout {
  x: number | `${number}%` | `calc(${string})`;
  y: number | `${number}%` | `calc(${string})`;
  width: number | `${number}%` | `calc(${string})`;
  height: number | `${number}%` | `calc(${string})`;
}

/** Modal 选项 */
export interface ModalOptions {
  /** 优先级（数值越大越优先，高优先级可打断低优先级） */
  priority?: number;
  /** 是否不可关闭（隐藏关闭按钮，必须通过 action 关闭） */
  uncloseable?: boolean;
  /** 是否显示遮罩层 */
  showBackdrop?: boolean;
  /** 遮罩层透明度（0-1） */
  backdropOpacity?: number;
  /** 自定义 HTML 文件路径（用于 custom key） */
  customHtmlPath?: string;
}

/** Modal 队列条目 */
export interface ModalQueueEntry {
  key: ShellModalKey;
  data: unknown;
  priority: number;
  uncloseable: boolean;
  showBackdrop: boolean;
  backdropOpacity: number;
  customHtmlPath?: string;
}

/** Dropdown 位置信息（相对于窗口左上角） */
export interface DropdownPosition {
  /** 锚点元素 bounds */
  anchorBounds: OverlayBounds;
  /** 首选方向 */
  preferredDirection?: "down" | "up" | "left" | "right";
}

/** Internal View API（供 Modal 内部渲染进程使用） */
export interface InternalViewAPI {
  /** 获取传入数据 */
  getData: () => Promise<unknown>;
  /** 关闭 Modal 并返回结果（触发 resolve） */
  close: (result?: unknown) => Promise<void>;
  /** 确认并关闭（触发 resolve） */
  confirm: (result?: unknown) => Promise<void>;
  /** 取消并关闭（触发 reject） */
  cancel: (reason?: string) => Promise<void>;
  /** 通知主进程 Modal 已准备好 */
  ready: () => Promise<void>;
}

/** Modal 渲染进程窗口扩展 */
declare global {
  interface Window {
    internalView?: InternalViewAPI;
  }
}

/** Modal 状态 */
export type ModalState =
  | "creating"
  | "loading"
  | "ready"
  | "showing"
  | "visible"
  | "hiding"
  | "closed"
  | "destroyed";

/** Dropdown 状态 */
export type DropdownState = "hidden" | "showing" | "visible" | "hiding";
