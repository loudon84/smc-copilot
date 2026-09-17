import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const THIS_RELEASE_VIEWS = [
  "Bases Card",
  "Create Base Dialog",
  "Base Detail Documents",
  "Base Detail Settings",
  "Delete Base AlertDialog",
  "Legacy Settings",
  "Legacy Chat",
] as const;

describe("Knowledge UI Kit visual contract", () => {
  it("keeps THIS_RELEASE views and does not require NEXT_STAGE page baselines", () => {
    const suite = readFileSync(
      resolve(process.cwd(), "scripts/drive-live-regression-suite.js"),
      "utf8",
    );
    expect(THIS_RELEASE_VIEWS).toHaveLength(7);
    for (const view of THIS_RELEASE_VIEWS) {
      expect(suite).toContain(view);
    }
    expect(THIS_RELEASE_VIEWS).not.toContain("Home");
    expect(THIS_RELEASE_VIEWS).not.toContain("Uploads");
    expect(THIS_RELEASE_VIEWS).not.toContain("Chat");
    expect(suite).not.toContain("Home migration baseline");
    expect(suite).not.toContain("Uploads migration baseline");
  });

  it("keeps kit CSS scoped and overlay-classes-only", () => {
    const css = readFileSync(
      resolve(process.cwd(), "styles/business-module-ui.css"),
      "utf8",
    );
    expect(css).toContain(".work-business-module-ui");
    expect(css).toContain('[data-slot="dialog-overlay"]');
    expect(css).toContain('[data-slot="alert-dialog-overlay"]');
    expect(css).toContain('[data-slot="sheet-overlay"]');
    expect(css).toContain('[data-slot="sheet-content"]');
    expect(css).toContain("backdrop-filter: none");
    expect(css).toMatch(/\[data-slot="sheet-overlay"\][\s\S]*?z-index:\s*1100/);
    expect(css).toContain('[data-slot="select-content"]');
    expect(css).toContain('[data-slot="dropdown-menu-content"]');
    expect(css).toContain('[data-slot="tooltip-content"]');
    expect(css).not.toMatch(/:root\s*\{/);
    expect(css).not.toContain("html.dark");
    expect(css).not.toMatch(/\b(html|body|\*)\s*\{/);
  });
});
