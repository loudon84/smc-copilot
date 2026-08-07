import type { BrowserViewBounds } from "../../shared/browser/browser-contract";

export interface BrowserViewPort {
  createView(url: string): Promise<void>;
  navigate(url: string): Promise<void>;
  destroyView(): void;
  updateBounds(bounds: BrowserViewBounds): void;
  getExternalWebContents(): Electron.WebContents | null;
  isReady(): boolean;
  onBoundsUpdate?(callback: (bounds: BrowserViewBounds) => void): void;
}
