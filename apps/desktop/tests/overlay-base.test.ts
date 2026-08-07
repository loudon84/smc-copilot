import { describe, it, expect, vi, beforeEach } from "vitest";

const mockWebContents = () => ({
  loadURL: vi.fn().mockResolvedValue(undefined),
  isLoading: vi.fn().mockReturnValue(false),
  isDestroyed: vi.fn().mockReturnValue(false),
  close: vi.fn(),
  on: vi.fn(),
  send: vi.fn(),
});

const mockContentView = {
  addChildView: vi.fn(),
  removeChildView: vi.fn(),
  children: [] as any[],
};

const mockBrowserWindow = {
  contentView: mockContentView,
  getBounds: vi.fn().mockReturnValue({ width: 1280, height: 800 }),
};

class MockWebContentsView {
  webContents = mockWebContents();
  setBounds = vi.fn();
  getBounds = vi.fn().mockReturnValue({ x: 0, y: 0, width: 400, height: 300 });
}

vi.mock("electron", () => ({
  WebContentsView: vi.fn().mockImplementation(() => new MockWebContentsView()),
  BrowserWindow: vi.fn().mockImplementation(() => mockBrowserWindow),
}));

describe("OverlayBase", () => {
  let OverlayBase: any;
  let overlay: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import("../src/main/shell/overlays/overlay-base");
    OverlayBase = module.OverlayBase;

    class TestOverlay extends OverlayBase {}
    overlay = new TestOverlay("test-id", mockBrowserWindow as any, "modal");
  });

  describe("Basic Properties", () => {
    it("should create with correct properties", () => {
      expect(overlay.getId()).toBe("test-id");
      expect(overlay.getLayer()).toBe("modal");
      expect(overlay.isShowing()).toBe(false);
    });

    it("should show with pixel bounds", async () => {
      const bounds = { x: 100, y: 100, width: 400, height: 300 };
      overlay.show(bounds);

      expect(overlay.isShowing()).toBe(true);
      expect(overlay.getBounds()).toEqual(bounds);
    });

    it("should show with percentage layout", async () => {
      overlay.show({
        x: "10%" as const,
        y: "10%" as const,
        width: "50%" as const,
        height: "50%" as const,
      });

      expect(overlay.isShowing()).toBe(true);
      const bounds = overlay.getBounds();
      expect(bounds.width).toBe(640); // 50% of 1280
      expect(bounds.height).toBe(400); // 50% of 800
    });

    it("should hide", async () => {
      overlay.show({ x: 0, y: 0, width: 100, height: 100 });
      expect(overlay.isShowing()).toBe(true);

      overlay.hide();
      expect(overlay.isShowing()).toBe(false);
    });

    it("should destroy", async () => {
      overlay.show({ x: 0, y: 0, width: 100, height: 100 });
      overlay.destroy();

      expect(overlay.isShowing()).toBe(false);
      expect(overlay.getNativeView()).toBeNull();
    });
  });

  describe("Layout Calculation", () => {
    it("should calculate calc expressions", async () => {
      overlay.show({
        x: "calc(50% - 200px)" as const,
        y: "100" as const,
        width: "400" as const,
        height: "300" as const,
      });

      const bounds = overlay.getBounds();
      expect(bounds.x).toBe(440); // (1280 * 0.5) - 200
    });
  });

  describe("Bring to Front", () => {
    it("should bring to front without error", async () => {
      overlay.show({ x: 0, y: 0, width: 100, height: 100 });
      expect(() => overlay.bringToFront()).not.toThrow();
    });
  });
});
