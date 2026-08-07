import { BrowserWindow, WebContentsView } from "electron";
import { EventEmitter } from "events";
import { evaluateLayoutCalc } from "../layout-calc-parser";
import type {
  OverlayBounds,
  OverlayLayout,
  OverlayLayer,
} from "../../../shared/shell/overlay-contract";

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
  calculate(layout: OverlayLayout): OverlayBounds {
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
    return evaluateLayoutCalc(expression, baseSize);
  }
}

/**
 * OverlayBase - Overlay 抽象基类
 *
 * 封装透明背景 WebContentsView 的通用能力：
 * - 透明背景设置
 * - Bounds 计算（支持百分比和 calc）
 * - 生命周期管理
 */
export abstract class OverlayBase extends EventEmitter {
  protected id: string;
  protected mainWindow: BrowserWindow;
  protected layer: OverlayLayer;
  protected nativeView: WebContentsView | null = null;
  protected isActive = false;
  protected currentBounds: OverlayBounds | null = null;

  constructor(id: string, mainWindow: BrowserWindow, layer: OverlayLayer) {
    super();
    this.id = id;
    this.mainWindow = mainWindow;
    this.layer = layer;
  }

  /**
   * 创建底层 WebContentsView
   * @param url - 要加载的 URL
   * @param preloadPath - preload 脚本路径（可选）
   */
  protected async createNativeView(
    url: string,
    preloadPath?: string,
  ): Promise<void> {
    if (this.nativeView) {
      console.warn(`[OverlayBase] View ${this.id} already created`);
      return;
    }

    // 创建 WebContentsView
    this.nativeView = new WebContentsView({
      webPreferences: {
        preload: preloadPath,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // 透明背景
        transparent: true,
        backgroundThrottling: false,
      },
    });

    // 透明背景通过 webPreferences 的 transparent 选项设置
    // 注意：WebContentsView 没有 setBackgroundColor 方法
    // 透明效果通过 CSS 和 webPreferences.transparent 实现

    // 加载 URL
    await this.nativeView.webContents.loadURL(url);

    this.emit("created", this.id);
  }

  /**
   * 显示 Overlay
   * @param boundsOrLayout - bounds 或 layout（支持百分比）
   */
  show(boundsOrLayout: OverlayBounds | OverlayLayout): void {
    if (!this.nativeView) {
      console.error(`[OverlayBase] Cannot show view ${this.id}: not created`);
      return;
    }

    // 计算 bounds
    let bounds: OverlayBounds;
    if (this.isLayout(boundsOrLayout)) {
      const calc = new LayoutCalculator(
        this.mainWindow.getBounds().width,
        this.mainWindow.getBounds().height,
      );
      bounds = calc.calculate(boundsOrLayout);
    } else {
      bounds = boundsOrLayout;
    }

    this.currentBounds = bounds;

    // 设置 bounds
    this.nativeView.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });

    // 添加到 contentView（如果不存在）
    const existingViews = this.mainWindow.contentView.children;
    if (!existingViews.includes(this.nativeView)) {
      this.mainWindow.contentView.addChildView(this.nativeView);
    }

    // 确保在最上层
    this.bringToFront();

    this.isActive = true;
    this.emit("shown", this.id, bounds);
  }

  /**
   * 隐藏 Overlay
   */
  hide(): void {
    if (!this.nativeView || !this.isActive) return;

    // 从 contentView 移除
    try {
      this.mainWindow.contentView.removeChildView(this.nativeView);
    } catch (err) {
      // 可能已经不在 contentView 中
    }

    this.isActive = false;
    this.emit("hidden", this.id);
  }

  /**
   * 销毁 Overlay
   */
  destroy(): void {
    if (this.nativeView) {
      this.hide();

      // 关闭 webContents
      if (!this.nativeView.webContents.isDestroyed()) {
        this.nativeView.webContents.close();
      }

      this.nativeView = null;
    }

    this.removeAllListeners();
    this.emit("destroyed", this.id);
  }

  /**
   * 置于最前
   */
  bringToFront(): void {
    if (!this.nativeView) return;

    // 重新添加到 contentView 以提升 z-index
    try {
      this.mainWindow.contentView.removeChildView(this.nativeView);
    } catch {
      // 可能原本就不在 contentView 中
    }
    this.mainWindow.contentView.addChildView(this.nativeView);

    this.emit("broughtToFront", this.id);
  }

  /**
   * 获取原生 View
   */
  getNativeView(): WebContentsView | null {
    return this.nativeView;
  }

  /**
   * 获取 ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * 获取 Layer
   */
  getLayer(): OverlayLayer {
    return this.layer;
  }

  /**
   * 检查是否 active
   */
  isShowing(): boolean {
    return this.isActive;
  }

  /**
   * 获取当前 bounds
   */
  getBounds(): OverlayBounds | null {
    return this.currentBounds;
  }

  /**
   * 发送 IPC 消息到渲染进程
   */
  send(channel: string, ...args: unknown[]): void {
    if (this.nativeView && !this.nativeView.webContents.isDestroyed()) {
      this.nativeView.webContents.send(channel, ...args);
    }
  }

  /**
   * 判断是否为 Layout（含百分比）
   */
  private isLayout(
    value: OverlayBounds | OverlayLayout,
  ): value is OverlayLayout {
    if (typeof value.x === "string") return true;
    if (typeof value.y === "string") return true;
    if (typeof value.width === "string") return true;
    if (typeof value.height === "string") return true;
    return false;
  }
}
