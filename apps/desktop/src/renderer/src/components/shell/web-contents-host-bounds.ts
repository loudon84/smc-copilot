export interface ShellHostBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bottom edge of the MainPage workspace (above the 32px status footer). */
export function getMainPageWorkspaceBottom(): number {
  const footer = document.querySelector(".MainPage__status");
  if (footer) {
    return footer.getBoundingClientRect().top;
  }
  return window.innerHeight;
}

/**
 * Map anchor rect → shell bounds. Expands height to workspace bottom when flex
 * under-reports (common when window is taller than DEFAULT_WINDOW_HEIGHT 800).
 */
export function resolveWebContentsHostBounds(
  anchorRect: Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">,
  workspaceBottomPx: number,
): ShellHostBounds | null {
  const x = Math.round(anchorRect.left);
  const y = Math.round(anchorRect.top);
  const width = Math.round(anchorRect.width);
  let height = Math.round(anchorRect.height);

  if (width < 1) {
    return null;
  }

  const expandedHeight = Math.round(workspaceBottomPx) - y;
  if (expandedHeight > height) {
    height = expandedHeight;
  }

  if (height < 1) {
    return null;
  }

  return { x, y, width, height };
}
