/**
 * Shell View 契约类型
 *
 * 定义 View 管理的核心类型，支持多 Layer、多 View 共存。
 */

/** View 类型 */
export type ShellViewKind =
  | "renderer-root"
  | "web-operator"
  | "portal"
  | "external-browser";

/** View 层级 */
export type ShellViewLayer = "background" | "content" | "overlay" | "floating";

/** View 状态 */
export type ShellViewState =
  | "creating"
  | "loading"
  | "ready"
  | "active"
  | "hidden"
  | "destroyed";

/** Bounds（像素值） */
export interface ShellViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Layout（支持百分比和 calc 表达式） */
export interface ShellViewLayout {
  x: number | `${number}%` | `calc(${string})`;
  y: number | `${number}%` | `calc(${string})`;
  width: number | `${number}%` | `calc(${string})`;
  height: number | `${number}%` | `calc(${string})`;
}

/** View 选项 */
export interface ShellViewOptions {
  kind: ShellViewKind;
  id: string;
  layer?: ShellViewLayer;
  partition?: string;
  sandbox?: boolean;
  nodeIntegration?: boolean;
  contextIsolation?: boolean;
  preload?: string;
}

/** 注册表条目 */
export interface ViewRegistryEntry {
  kind: ShellViewKind;
  defaultLayer: ShellViewLayer;
  defaultPartition?: string;
  defaultSandbox?: boolean;
  defaultNodeIntegration?: boolean;
  defaultContextIsolation?: boolean;
  defaultPreload?: string;
  defaultLayout?: ShellViewLayout;
}

/** View 激活配置 */
export interface ViewActivationConfig {
  id: string;
  boundsOrLayout?: ShellViewBounds | ShellViewLayout;
}
