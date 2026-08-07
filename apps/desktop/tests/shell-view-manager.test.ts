import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks - must be defined before vi.mock
const mockWebContents = () => ({
  loadURL: vi.fn().mockResolvedValue(undefined),
  reload: vi.fn(),
  focus: vi.fn(),
  openDevTools: vi.fn(),
  close: vi.fn(),
  isDestroyed: vi.fn().mockReturnValue(false),
  getURL: vi.fn().mockReturnValue("https://example.com"),
  getTitle: vi.fn().mockReturnValue("Example"),
  canGoBack: vi.fn().mockReturnValue(false),
  canGoForward: vi.fn().mockReturnValue(false),
  on: vi.fn(),
});

// Create WebContentsView mock class
function createMockWebContentsView() {
  return {
    webContents: mockWebContents(),
    setBounds: vi.fn(),
    getBounds: vi.fn().mockReturnValue({ x: 0, y: 0, width: 800, height: 600 }),
  };
}

// Mock BrowserWindow factory
function createMockBrowserWindow() {
  return {
    contentView: {
      addChildView: vi.fn(),
      removeChildView: vi.fn(),
    },
    getBounds: vi.fn().mockReturnValue({ width: 1280, height: 800 }),
    on: vi.fn(),
  };
}

// Hoist vi.mock
vi.mock("electron", () => {
  return {
    WebContentsView: vi.fn().mockImplementation(createMockWebContentsView),
    BrowserWindow: vi.fn().mockImplementation(createMockBrowserWindow),
  };
});

describe("ShellViewManager", () => {
  let mockBrowserWindow: ReturnType<typeof createMockBrowserWindow>;
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockBrowserWindow = createMockBrowserWindow();
  });

  describe("View Lifecycle", () => {
    it("should create a view", async () => {
      const { ShellViewManager } =
        await import("../src/main/shell/views/shell-view-manager");
      const manager = new ShellViewManager(mockBrowserWindow as any);

      await manager.createView(
        "test-view",
        "web-operator",
        "https://example.com",
      );

      expect(manager.hasView("test-view")).toBe(true);
    });

    it("should destroy a view", async () => {
      const { ShellViewManager } =
        await import("../src/main/shell/views/shell-view-manager");
      const manager = new ShellViewManager(mockBrowserWindow as any);

      await manager.createView(
        "test-view",
        "web-operator",
        "https://example.com",
      );
      manager.destroyView("test-view");

      expect(manager.hasView("test-view")).toBe(false);
    });

    it("should get a view", async () => {
      const { ShellViewManager } =
        await import("../src/main/shell/views/shell-view-manager");
      const manager = new ShellViewManager(mockBrowserWindow as any);

      await manager.createView(
        "test-view",
        "web-operator",
        "https://example.com",
      );
      const view = manager.getView("test-view");

      expect(view).toBeDefined();
      expect(view?.getId()).toBe("test-view");
    });
  });

  describe("View Activation", () => {
    it("should activate a view with pixel bounds", async () => {
      const { ShellViewManager } =
        await import("../src/main/shell/views/shell-view-manager");
      const manager = new ShellViewManager(mockBrowserWindow as any);

      await manager.createView(
        "test-view",
        "web-operator",
        "https://example.com",
      );
      manager.activateView("test-view", { x: 0, y: 0, width: 400, height: 300 });

      expect(manager.isViewActive("test-view")).toBe(true);
    });

    it("should support multiple active views in different layers", async () => {
      const { ShellViewManager } =
        await import("../src/main/shell/views/shell-view-manager");
      const manager = new ShellViewManager(mockBrowserWindow as any);

      await manager.createView(
        "background-view",
        "external-browser",
        "https://example.com",
        { layer: "background" },
      );
      await manager.createView(
        "content-view",
        "web-operator",
        "https://example.com",
        { layer: "content" },
      );

      manager.activateView("background-view", {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
      manager.activateView("content-view", {
        x: 0,
        y: 0,
        width: 200,
        height: 200,
      });

      expect(manager.isViewActive("background-view")).toBe(true);
      expect(manager.isViewActive("content-view")).toBe(true);
    });

    it("should deactivate a view", async () => {
      const { ShellViewManager } =
        await import("../src/main/shell/views/shell-view-manager");
      const manager = new ShellViewManager(mockBrowserWindow as any);

      await manager.createView(
        "test-view",
        "web-operator",
        "https://example.com",
      );
      manager.activateView("test-view", { x: 0, y: 0, width: 400, height: 300 });
      manager.deactivateView("test-view");

      expect(manager.isViewActive("test-view")).toBe(false);
    });

    it("should deactivate all views in a layer", async () => {
      const { ShellViewManager } =
        await import("../src/main/shell/views/shell-view-manager");
      const manager = new ShellViewManager(mockBrowserWindow as any);

      await manager.createView(
        "view1",
        "web-operator",
        "https://example.com",
      );
      await manager.createView(
        "view2",
        "portal",
        "https://example.com",
      );

      manager.activateView("view1", { x: 0, y: 0, width: 100, height: 100 });
      manager.activateView("view2", { x: 0, y: 0, width: 100, height: 100 });
      manager.deactivateLayer("content");

      expect(manager.isViewActive("view1")).toBe(false);
      expect(manager.isViewActive("view2")).toBe(false);
    });
  });

  describe("View Switching", () => {
    it("should switch views in the same layer", async () => {
      const { ShellViewManager } =
        await import("../src/main/shell/views/shell-view-manager");
      const manager = new ShellViewManager(mockBrowserWindow as any);

      await manager.createView(
        "view1",
        "web-operator",
        "https://example.com",
      );
      await manager.createView(
        "view2",
        "portal",
        "https://example.com",
      );

      manager.activateView("view1", { x: 0, y: 0, width: 100, height: 100 });
      manager.switchViewInLayer("view2");

      expect(manager.isViewActive("view1")).toBe(false);
      expect(manager.isViewActive("view2")).toBe(true);
    });
  });

  describe("bringToFront", () => {
    it("should bring view to front", async () => {
      const { ShellViewManager } =
        await import("../src/main/shell/views/shell-view-manager");
      const manager = new ShellViewManager(mockBrowserWindow as any);

      await manager.createView(
        "test-view",
        "web-operator",
        "https://example.com",
      );
      manager.activateView("test-view", { x: 0, y: 0, width: 100, height: 100 });

      // Should not throw
      expect(() => manager.bringToFront("test-view")).not.toThrow();
    });
  });

  describe("Layout Calculation", () => {
    it("should calculate percentage layout", async () => {
      const { ShellViewManager } =
        await import("../src/main/shell/views/shell-view-manager");
      const manager = new ShellViewManager(mockBrowserWindow as any);

      await manager.createView(
        "test-view",
        "web-operator",
        "https://example.com",
      );
      manager.activateView("test-view", {
        x: "10%",
        y: "10%",
        width: "50%",
        height: "50%",
      });

      expect(manager.isViewActive("test-view")).toBe(true);
    });
  });

  describe("Queries", () => {
    it("should get all active views", async () => {
      const { ShellViewManager } =
        await import("../src/main/shell/views/shell-view-manager");
      const manager = new ShellViewManager(mockBrowserWindow as any);

      await manager.createView(
        "view1",
        "web-operator",
        "https://example.com",
      );
      manager.activateView("view1", { x: 0, y: 0, width: 100, height: 100 });

      const activeViews = manager.getAllActiveViews();
      expect(activeViews.length).toBeGreaterThan(0);
    });

    it("should check if view exists", async () => {
      const { ShellViewManager } =
        await import("../src/main/shell/views/shell-view-manager");
      const manager = new ShellViewManager(mockBrowserWindow as any);

      await manager.createView(
        "test-view",
        "web-operator",
        "https://example.com",
      );

      expect(manager.hasView("test-view")).toBe(true);
      expect(manager.hasView("non-existent")).toBe(false);
    });

    it("should check if view is active", async () => {
      const { ShellViewManager } =
        await import("../src/main/shell/views/shell-view-manager");
      const manager = new ShellViewManager(mockBrowserWindow as any);

      await manager.createView(
        "test-view",
        "web-operator",
        "https://example.com",
      );

      expect(manager.isViewActive("test-view")).toBe(false);
      manager.activateView("test-view", { x: 0, y: 0, width: 100, height: 100 });
      expect(manager.isViewActive("test-view")).toBe(true);
    });
  });

  describe("Bulk Operations", () => {
    it("should activate multiple views at once (in different layers)", async () => {
      const { ShellViewManager } =
        await import("../src/main/shell/views/shell-view-manager");
      const manager = new ShellViewManager(mockBrowserWindow as any);

      // Create views in different layers (can coexist)
      await manager.createView(
        "view1",
        "web-operator",
        "https://example.com",
        { layer: "content" },
      );
      await manager.createView(
        "view2",
        "external-browser",
        "https://example.com",
        { layer: "background" },
      );

      manager.activateViews([
        { id: "view1", boundsOrLayout: { x: 0, y: 0, width: 100, height: 100 } },
        { id: "view2", boundsOrLayout: { x: 100, y: 0, width: 100, height: 100 } },
      ]);

      // Both should be active since they are in different layers
      expect(manager.isViewActive("view1")).toBe(true);
      expect(manager.isViewActive("view2")).toBe(true);
    });
  });
});
