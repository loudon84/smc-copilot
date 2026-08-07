import { WebContentsView, BrowserWindow } from "electron";
import type {
  ShellViewKind,
  ShellViewLayer,
  ShellViewState,
  ShellViewBounds,
  ShellViewOptions,
} from "../../../shared/shell/view-contract";
import type { ShellViewSnapshot } from "../../../shared/shell/shell-view-contract";
import { assertPreloadExists } from "../../utils/preload-paths";
import { viewRegistry } from "./view-registry";
import { viewEventBus } from "./view-events";

/**
 * 托管的 WebContentsView
 *
 * 封装单个 WebContentsView 的完整生命周期。
 */
export class ManagedWebContentsView {
  private view: WebContentsView | null = null;
  private state: ShellViewState = "creating";
  private id: string;
  private kind: ShellViewKind;
  private layer: ShellViewLayer;
  private parent: BrowserWindow;
  private currentBounds: ShellViewBounds = { x: 0, y: 0, width: 0, height: 0 };

  private title = "";
  private favicon: string | undefined;
  private loading = false;

  private errorCode: number | undefined;
  private errorDescription: string | undefined;

  private crashed = false;
  private crashedReason: string | undefined;
  private crashedExitCode: number | undefined;

  constructor(
    id: string,
    kind: ShellViewKind,
    parent: BrowserWindow,
    layer?: ShellViewLayer,
  ) {
    this.id = id;
    this.kind = kind;
    this.parent = parent;

    const registryEntry = viewRegistry.get(kind);
    this.layer = layer ?? registryEntry?.defaultLayer ?? "content";
  }

  async create(
    url: string,
    options?: Partial<ShellViewOptions>,
  ): Promise<void> {
    if (this.getWebContents()) {
      await this.load(url);
      return;
    }

    this.setState("creating");

    const registryEntry = viewRegistry.get(this.kind);

    let sandbox = options?.sandbox ?? registryEntry?.defaultSandbox ?? true;
    const nodeIntegration =
      options?.nodeIntegration ??
      registryEntry?.defaultNodeIntegration ??
      false;
    const contextIsolation =
      options?.contextIsolation ??
      registryEntry?.defaultContextIsolation ??
      true;
    const partition =
      options?.partition ?? registryEntry?.defaultPartition ?? undefined;
    let preload =
      options?.preload ?? registryEntry?.defaultPreload ?? undefined;

    if (this.kind === "web-operator") {
      sandbox = false;
      preload = assertPreloadExists("crm-bridge-preload.js");
      console.log("[CRM-BRIDGE] web-operator preload:", preload, "sandbox:", sandbox);
    }

    const webPreferences: Electron.WebPreferences = {
      sandbox,
      nodeIntegration,
      contextIsolation,
    };

    if (partition) {
      webPreferences.partition = partition;
    }

    if (preload) {
      webPreferences.preload = preload;
    }

    this.view = new WebContentsView({ webPreferences });

    this.parent.contentView.addChildView(this.view);
    this.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

    this.bindViewEvents();

    this.loading = true;
    this.setState("loading");
    await this.view.webContents.loadURL(url);
    this.loading = false;
    this.setState("ready");

    viewEventBus.emitViewCreated(this.id, this.kind, this.layer);
    this.emitMetadataChanged();
  }

  async load(url: string): Promise<void> {
    const wc = this.getWebContents();
    if (!wc) {
      throw new Error(`View ${this.id} is not created or destroyed`);
    }

    this.loading = true;
    this.errorCode = undefined;
    this.errorDescription = undefined;
    this.crashed = false;
    this.setState("loading");
    await wc.loadURL(url);
    this.loading = false;
    this.setState("ready");
    this.emitMetadataChanged();
  }

  reload(): void {
    const wc = this.getWebContents();
    if (!wc) return;
    wc.reload();
    this.emitMetadataChanged();
  }

  stopLoading(): void {
    const wc = this.getWebContents();
    if (!wc) return;
    wc.stop();
    this.loading = false;
    this.emitMetadataChanged();
  }

  goBack(): void {
    const wc = this.getWebContents();
    if (!wc || !wc.canGoBack()) return;
    wc.goBack();
    this.emitMetadataChanged();
  }

  goForward(): void {
    const wc = this.getWebContents();
    if (!wc || !wc.canGoForward()) return;
    wc.goForward();
    this.emitMetadataChanged();
  }

  show(bounds: ShellViewBounds): void {
    if (!this.view || !this.getWebContents()) return;

    this.currentBounds = bounds;
    this.view.setBounds(bounds);

    if (this.state !== "active") {
      this.setState("active");
      viewEventBus.emitViewActivated(this.id, this.kind, this.layer);
    }

    viewEventBus.emitViewBoundsChanged(this.id, this.kind, bounds);
    this.emitMetadataChanged();
  }

  hide(): void {
    if (!this.view || !this.getWebContents()) return;

    this.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

    if (this.state === "active") {
      this.setState("hidden");
      viewEventBus.emitViewDeactivated(this.id, this.kind, this.layer);
    }
    this.emitMetadataChanged();
  }

  updateBounds(bounds: ShellViewBounds): void {
    if (!this.view || !this.getWebContents()) return;

    this.currentBounds = bounds;
    this.view.setBounds(bounds);

    viewEventBus.emitViewBoundsChanged(this.id, this.kind, bounds);
    this.emitMetadataChanged();
  }

  getBounds(): ShellViewBounds {
    return { ...this.currentBounds };
  }

  focus(): void {
    const wc = this.getWebContents();
    if (!wc) return;
    wc.focus();
  }

  openDevTools(): void {
    const wc = this.getWebContents();
    if (!wc) return;
    wc.openDevTools({ mode: "detach" });
  }

  destroy(): void {
    if (!this.view) return;

    const wc = this.view.webContents;
    if (wc && !wc.isDestroyed()) {
      this.parent.contentView.removeChildView(this.view);
      wc.close();
    }

    this.view = null;
    this.setState("destroyed");

    viewEventBus.emitViewDestroyed(this.id, this.kind, this.layer);
  }

  isReady(): boolean {
    return this.getWebContents() !== null;
  }

  isActive(): boolean {
    return this.state === "active";
  }

  getWebContents(): Electron.WebContents | null {
    const wc = this.view?.webContents;
    if (!wc || wc.isDestroyed()) return null;
    return wc;
  }

  getState(): ShellViewState {
    return this.state;
  }

  getId(): string {
    return this.id;
  }

  getKind(): ShellViewKind {
    return this.kind;
  }

  getLayer(): ShellViewLayer {
    return this.layer;
  }

  getNativeView(): WebContentsView | null {
    return this.view;
  }

  getSnapshot(): ShellViewSnapshot {
    const webContents = this.getWebContents();

    return {
      id: this.id,
      kind: this.kind,
      layer: this.layer,
      state: this.state,
      active: this.isActive(),

      url: webContents?.getURL() ?? "",
      title: this.title || webContents?.getTitle?.() || "",
      favicon: this.favicon,

      loading: this.loading,
      canGoBack: webContents?.canGoBack() ?? false,
      canGoForward: webContents?.canGoForward() ?? false,

      bounds: this.getBounds(),

      errorCode: this.errorCode,
      errorDescription: this.errorDescription,

      crashed: this.crashed,
      crashedReason: this.crashedReason,
      crashedExitCode: this.crashedExitCode,

      updatedAt: Date.now(),
    };
  }

  private emitMetadataChanged(): void {
    viewEventBus.emitViewMetadataChanged(this.getSnapshot());
  }

  private setState(newState: ShellViewState): void {
    const previousState = this.state;
    this.state = newState;
    viewEventBus.emitViewStateChanged(this.id, newState, previousState);
    this.emitMetadataChanged();
  }

  private bindViewEvents(): void {
    if (!this.view) return;

    const wc = this.view.webContents;

    if (this.kind === "web-operator") {
      wc.on("preload-error", (_event, preloadPath, error) => {
        console.error("[CRM-BRIDGE] preload-error:", preloadPath, error);
      });
    }

    wc.on("page-title-updated", (_event, title) => {
      this.title = title;
      this.emitMetadataChanged();
    });

    wc.on("page-favicon-updated", (_event, favicons) => {
      this.favicon = favicons?.[0];
      this.emitMetadataChanged();
    });

    wc.on("did-start-loading", () => {
      this.loading = true;
      this.errorCode = undefined;
      this.errorDescription = undefined;
      this.crashed = false;
      this.emitMetadataChanged();
    });

    wc.on("did-stop-loading", () => {
      this.loading = false;
      this.emitMetadataChanged();
    });

    wc.on("did-navigate", () => {
      this.emitMetadataChanged();
    });

    wc.on("did-navigate-in-page", () => {
      this.emitMetadataChanged();
    });

    wc.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) return;

        this.loading = false;
        this.errorCode = errorCode;
        this.errorDescription = errorDescription;

        viewEventBus.emitViewLoadFailed(
          this.id,
          validatedURL,
          errorCode,
          errorDescription,
        );

        this.emitMetadataChanged();
      },
    );

    wc.on("render-process-gone", (_event, details) => {
      this.loading = false;
      this.crashed = true;
      this.crashedReason = details.reason;
      this.crashedExitCode = details.exitCode;

      viewEventBus.emitViewCrashed(
        this.id,
        details.reason,
        details.exitCode,
      );

      console.error(
        `[VIEW:${this.id}] Renderer process gone:`,
        details.reason,
        details.exitCode,
      );

      this.emitMetadataChanged();
    });
  }
}
