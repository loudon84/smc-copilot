import { BrowserWindow, WebContentsView } from "electron";
import { EventEmitter } from "events";
import type {
  ShellViewKind,
  ShellViewLayer,
  ShellViewBounds,
  ShellViewLayout,
  ShellViewOptions,
  ViewActivationConfig,
} from "../../../shared/shell/view-contract";
import type { ShellViewSnapshot } from "../../../shared/shell/shell-view-contract";
import { evaluateLayoutCalc } from "../layout-calc-parser";
import { ManagedWebContentsView } from "./managed-webcontents-view";
import { viewRegistry } from "./view-registry";
import { viewEventBus } from "./view-events";

/**
 * Layout 计算器
 *
 * 将百分比/calc 表达式解析为像素值。
 */
class LayoutCalculator {
  constructor(
    private windowWidth: number,
    private windowHeight: number,
  ) {}

  /**
   * 解析 layout 为 bounds
   */
  calculate(layout: ShellViewLayout): ShellViewBounds {
    return {
      x: this.resolveValue(layout.x, this.windowWidth),
      y: this.resolveValue(layout.y, this.windowHeight),
      width: this.resolveValue(layout.width, this.windowWidth),
      height: this.resolveValue(layout.height, this.windowHeight),
    };
  }

  /**
   * 解析单个值
   */
  private resolveValue(
    value: number | `${number}%` | `calc(${string})`,
    baseSize: number,
  ): number {
    if (typeof value === "number") {
      return value;
    }

    // 百分比: "50%"
    if (value.endsWith("%")) {
      const percent = parseFloat(value.slice(0, -1));
      return Math.floor((baseSize * percent) / 100);
    }

    // calc 表达式: "calc(100% - 40px)"
    if (value.startsWith("calc(") && value.endsWith(")")) {
      const expression = value.slice(5, -1).trim();
      return this.evaluateCalc(expression, baseSize);
    }

    // 尝试解析为数字
    const num = parseFloat(value);
    if (!isNaN(num)) {
      return num;
    }

    return 0;
  }

  /**
   * 简单 calc 表达式求值
   * 支持: 100% - 40px, 50% + 100px, 100px, etc.
   */
  private evaluateCalc(expression: string, baseSize: number): number {
    // 处理百分比
    expression = expression.replace(/(\d+(?:\.\d+)?)%/g, (_match, percent) => {
      return String((baseSize * parseFloat(percent)) / 100);
    });

    // 移除 px 单位
    expression = expression.replace(/px/g, "");

    return evaluateLayoutCalc(expression, baseSize);
  }
}

/**
 * Shell View Manager
 *
 * 统一管理所有 WebContentsView，支持：
 * - 多 Layer 共存（background/content/overlay/floating）
 * - 同 Layer 互斥
 * - 百分比 Layout 自动重算
 * - z-index 管理（bringToFront）
 */
export class ShellViewManager extends EventEmitter {
  private views: Map<string, ManagedWebContentsView> = new Map();
  private activeViewsByLayer: Map<ShellViewLayer, Set<string>> = new Map();
  private lastActivationLayoutById = new Map<string, ShellViewLayout>();
  private lastActivationBoundsById = new Map<string, ShellViewBounds>();
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    super();
    this.mainWindow = mainWindow;
    this.bindWindowResize();
  }

  /**
   * 创建 View
   */
  async createView(
    id: string,
    kind: ShellViewKind,
    url: string,
    options?: Partial<ShellViewOptions>,
  ): Promise<void> {
    if (this.views.has(id)) {
      // V2.3 keep-alive: never destroy on createView — recoverView is the
      // explicit path for destroy+recreate.  If the caller wants a different
      // URL, use loadUrl instead.
      console.warn(
        `[ShellViewManager] View ${id} already exists, skipping create (keep-alive)`,
      );
      return;
    }

    // 创建 ManagedWebContentsView
    const layer =
      options?.layer ?? viewRegistry.get(kind)?.defaultLayer ?? "content";
    const view = new ManagedWebContentsView(id, kind, this.mainWindow, layer);

    // 存储
    this.views.set(id, view);

    // 创建底层 WebContentsView
    await view.create(url, options);
  }

  /**
   * 激活 View
   */
  activateView(
    id: string,
    boundsOrLayout?: ShellViewBounds | ShellViewLayout,
  ): void {
    const view = this.views.get(id);
    if (!view) {
      console.error(`[ShellViewManager] View ${id} not found`);
      return;
    }

    const layer = view.getLayer();

    // 同 Layer 互斥：deactivate 同 layer 的其他 view
    this.deactivateLayerExcept(layer, id);

    // 计算 bounds
    let bounds: ShellViewBounds;
    if (boundsOrLayout) {
      if (this.isLayout(boundsOrLayout)) {
        this.lastActivationLayoutById.set(id, boundsOrLayout);
        this.lastActivationBoundsById.delete(id);
        const calc = new LayoutCalculator(
          this.mainWindow.getBounds().width,
          this.mainWindow.getBounds().height,
        );
        bounds = calc.calculate(boundsOrLayout);
      } else {
        this.lastActivationBoundsById.set(id, boundsOrLayout);
        this.lastActivationLayoutById.delete(id);
        bounds = boundsOrLayout;
      }
    } else {
      // 使用默认 bounds（全屏）
      const winBounds = this.mainWindow.getBounds();
      bounds = { x: 0, y: 0, width: winBounds.width, height: winBounds.height };
    }

    // 激活
    view.show(bounds);

    // 记录 active
    if (!this.activeViewsByLayer.has(layer)) {
      this.activeViewsByLayer.set(layer, new Set());
    }
    this.activeViewsByLayer.get(layer)!.add(id);
  }

  /**
   * 批量激活
   */
  activateViews(configs: ViewActivationConfig[]): void {
    for (const config of configs) {
      this.activateView(config.id, config.boundsOrLayout);
    }
  }

  /**
   * Deactivate View
   */
  deactivateView(id: string): void {
    const view = this.views.get(id);
    if (!view) return;

    view.hide();

    const layer = view.getLayer();
    this.activeViewsByLayer.get(layer)?.delete(id);
  }

  /**
   * Deactivate 整个 Layer
   */
  deactivateLayer(layer: ShellViewLayer): void {
    const activeIds = this.activeViewsByLayer.get(layer);
    if (!activeIds) return;

    for (const id of activeIds) {
      this.views.get(id)?.hide();
    }

    activeIds.clear();
  }

  /**
   * 切换 Layer 内的 View
   *（deactivate 同 layer 其他，activate 指定）
   */
  switchViewInLayer(
    id: string,
    layer?: ShellViewLayer,
    boundsOrLayout?: ShellViewBounds | ShellViewLayout,
  ): void {
    const view = this.views.get(id);
    if (!view) {
      console.error(`[ShellViewManager] View ${id} not found`);
      return;
    }

    const targetLayer = layer ?? view.getLayer();

    // Deactivate 同 layer 其他
    this.deactivateLayerExcept(targetLayer, id);

    // Activate 指定 view
    this.activateView(id, boundsOrLayout);
  }

  /**
   * 将 View 置于同 layer 最顶层
   */
  bringToFront(id: string): void {
    const view = this.views.get(id);
    if (!view) return;

    const nativeView = view.getNativeView();
    if (!nativeView) return;

    // 重新添加到 contentView 以提升 z-index
    this.mainWindow.contentView.removeChildView(nativeView);
    this.mainWindow.contentView.addChildView(nativeView);

    viewEventBus.emitViewBroughtToFront(id, view.getKind(), view.getLayer());
  }

  /**
   * Destroy View
   */
  destroyView(id: string): void {
    const view = this.views.get(id);
    if (!view) return;

    // 从 active 记录中移除
    const layer = view.getLayer();
    this.activeViewsByLayer.get(layer)?.delete(id);

    // Destroy
    view.destroy();
    this.views.delete(id);
  }

  /**
   * 获取 View
   */
  getView(id: string): ManagedWebContentsView | undefined {
    return this.views.get(id);
  }

  /**
   * 获取指定 Layer 的 active views
   */
  getActiveViewsInLayer(layer: ShellViewLayer): string[] {
    return Array.from(this.activeViewsByLayer.get(layer) ?? []);
  }

  /**
   * 获取所有 active views
   */
  getAllActiveViews(): Array<{ id: string; layer: ShellViewLayer }> {
    const result: Array<{ id: string; layer: ShellViewLayer }> = [];

    for (const [layer, ids] of this.activeViewsByLayer) {
      for (const id of ids) {
        result.push({ id, layer });
      }
    }

    return result;
  }

  /**
   * 获取所有 View
   */
  getAllViews(): ManagedWebContentsView[] {
    return Array.from(this.views.values());
  }

  async loadUrl(id: string, url: string): Promise<void> {
    const view = this.views.get(id);
    if (!view) {
      throw new Error(`[ShellViewManager] View ${id} not found`);
    }
    await view.load(url);
  }

  focusView(id: string): void {
    const view = this.views.get(id);
    if (!view) {
      throw new Error(`[ShellViewManager] View ${id} not found`);
    }
    view.focus();
  }

  getViewSnapshot(id: string): ShellViewSnapshot | null {
    const view = this.views.get(id);
    if (!view) {
      return null;
    }

    return view.getSnapshot();
  }

  reloadView(id: string): void {
    const view = this.views.get(id);
    if (!view) {
      throw new Error(`[ShellViewManager] View ${id} not found`);
    }
    view.reload();
  }

  stopLoadingView(id: string): void {
    const view = this.views.get(id);
    if (!view) {
      throw new Error(`[ShellViewManager] View ${id} not found`);
    }
    view.stopLoading();
  }

  goBackView(id: string): void {
    const view = this.views.get(id);
    if (!view) {
      throw new Error(`[ShellViewManager] View ${id} not found`);
    }
    view.goBack();
  }

  goForwardView(id: string): void {
    const view = this.views.get(id);
    if (!view) {
      throw new Error(`[ShellViewManager] View ${id} not found`);
    }
    view.goForward();
  }

  async recoverView(id: string): Promise<void> {
    const snapshot = this.getViewSnapshot(id);
    if (!snapshot?.url) {
      throw new Error(`[ShellViewManager] Cannot recover ${id}: empty url`);
    }

    const kind = snapshot.kind;
    const layer = snapshot.layer;
    const url = snapshot.url;
    const bounds = snapshot.bounds;
    const wasActive = snapshot.active;

    this.destroyView(id);
    await this.createView(id, kind, url, { layer });
    if (wasActive && bounds.width > 0 && bounds.height > 0) {
      this.activateView(id, bounds);
    }
  }

  getAllViewSnapshots(): ShellViewSnapshot[] {
    return Array.from(this.views.keys())
      .map((id) => this.getViewSnapshot(id))
      .filter((item): item is ShellViewSnapshot => item !== null);
  }

  /**
   * 检查 View 是否存在
   */
  hasView(id: string): boolean {
    return this.views.has(id);
  }

  /**
   * 检查 View 是否 active
   */
  isViewActive(id: string): boolean {
    const view = this.views.get(id);
    if (!view) return false;
    return view.isActive();
  }

  /** Last bounds from activateView/setBounds — used to restore visibility after URL refresh. */
  getLastActivationBounds(id: string): ShellViewBounds | undefined {
    const bounds = this.lastActivationBoundsById.get(id);
    if (!bounds || bounds.width < 1 || bounds.height < 1) {
      return undefined;
    }
    return bounds;
  }

  /**
   * 窗口 resize 时自动重算百分比 bounds
   */
  private bindWindowResize(): void {
    let resizeTimeout: NodeJS.Timeout | null = null;

    this.mainWindow.on("resize", () => {
      // 防抖
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      resizeTimeout = setTimeout(() => {
        this.handleWindowResize();
      }, 100);
    });
  }

  /**
   * 处理窗口 resize
   */
  private handleWindowResize(): void {
    const winBounds = this.mainWindow.getBounds();
    const calc = new LayoutCalculator(winBounds.width, winBounds.height);

    for (const ids of this.activeViewsByLayer.values()) {
      for (const id of ids) {
        const view = this.views.get(id);
        if (!view || !view.isActive()) continue;

        const layout = this.lastActivationLayoutById.get(id);
        if (!layout) continue;

        view.updateBounds(calc.calculate(layout));
      }
    }
  }

  /**
   * Deactivate Layer 中除指定 View 外的所有 View
   */
  private deactivateLayerExcept(layer: ShellViewLayer, exceptId: string): void {
    const activeIds = this.activeViewsByLayer.get(layer);
    if (!activeIds) return;

    for (const id of activeIds) {
      if (id === exceptId) continue;
      this.views.get(id)?.hide();
    }

    activeIds.clear();
    activeIds.add(exceptId);
  }

  /**
   * 判断是否为 Layout（含百分比）
   */
  private isLayout(
    value: ShellViewBounds | ShellViewLayout,
  ): value is ShellViewLayout {
    if (typeof value.x === "string") return true;
    if (typeof value.y === "string") return true;
    if (typeof value.width === "string") return true;
    if (typeof value.height === "string") return true;
    return false;
  }
}
