import type { WebContents } from "electron";
import type { BrowserFrameSnapshot } from "../../shared/browser/browser-frame-contract";

function frameIdOf(frame: Electron.WebFrameMain): string {
  return String(frame.frameTreeNodeId);
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export class BrowserFrameInspector {
  listFrames(webContents: WebContents): BrowserFrameSnapshot[] {
    if (webContents.isDestroyed()) return [];

    const main = webContents.mainFrame;
    const snapshots: BrowserFrameSnapshot[] = [];

    const walk = (
      frame: Electron.WebFrameMain,
      depth: number,
      path: number[],
      parentFrame: Electron.WebFrameMain | null,
    ): void => {
      const parentOrigin = parentFrame ? originOf(parentFrame.url) : "";
      const frameOrigin = originOf(frame.url);
      const children = frame.frames;
      snapshots.push({
        frameId: frameIdOf(frame),
        parentFrameId: parentFrame ? frameIdOf(parentFrame) : undefined,
        url: frame.url,
        origin: frameOrigin,
        name: frame.name || undefined,
        title: undefined,
        depth,
        path: [...path],
        sameOriginWithParent: parentFrame
          ? parentOrigin === frameOrigin && parentOrigin !== ""
          : true,
        childCount: children.length,
      });

      children.forEach((child, index) => {
        walk(child, depth + 1, [...path, index], frame);
      });
    };

    walk(main, 0, [], null);
    return snapshots;
  }

  findFrame(
    webContents: WebContents,
    frameId?: string,
    framePath?: number[],
  ): Electron.WebFrameMain | null {
    if (webContents.isDestroyed()) return null;
    const frames = this.listFrames(webContents);

    if (frameId) {
      const match = frames.find((f) => f.frameId === frameId);
      if (!match) return null;
      return this.resolveFrameByPath(webContents, match.path);
    }

    if (framePath && framePath.length > 0) {
      return this.resolveFrameByPath(webContents, framePath);
    }

    return webContents.mainFrame;
  }

  resolveFrameByPath(
    webContents: WebContents,
    path: number[],
  ): Electron.WebFrameMain | null {
    if (webContents.isDestroyed()) return null;
    let current: Electron.WebFrameMain = webContents.mainFrame;
    for (const index of path) {
      const children = current.frames;
      if (index < 0 || index >= children.length) return null;
      current = children[index]!;
    }
    return current;
  }
}
