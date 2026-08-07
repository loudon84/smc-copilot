import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock BrowserWindow
const mockContentView = {
  addChildView: vi.fn(),
  removeChildView: vi.fn(),
  children: [] as any[],
};

const mockBrowserWindow = {
  contentView: mockContentView,
  getBounds: vi.fn().mockReturnValue({ width: 1280, height: 800 }),
  on: vi.fn(),
  webContents: { send: vi.fn() },
};

// Mock WebContents
const mockWebContents = {
  loadURL: vi.fn().mockResolvedValue(undefined),
  isLoading: vi.fn().mockReturnValue(false),
  isDestroyed: vi.fn().mockReturnValue(false),
  close: vi.fn(),
  on: vi.fn(),
  send: vi.fn(),
};

// Mock WebContentsView as a proper class
class MockWebContentsViewClass {
  webContents = mockWebContents;
  setBounds = vi.fn();
  getBounds = vi.fn().mockReturnValue({ x: 0, y: 0, width: 400, height: 300 });
}

vi.mock("electron", async () => {
  return {
    WebContentsView: MockWebContentsViewClass,
    BrowserWindow: vi.fn().mockImplementation(() => mockBrowserWindow),
  };
});

describe("ModalManager", () => {
  let ModalManager: any;
  let manager: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import("../src/main/shell/overlays/modal-manager");
    ModalManager = module.ModalManager;
    manager = new ModalManager(mockBrowserWindow, "/mock/preload.js");
  });

  describe("Basic Operations", () => {
    it("should create a ModalManager instance", () => {
      expect(manager).toBeDefined();
      expect(manager.hasActiveModal()).toBe(false);
      expect(manager.getQueueLength()).toBe(0);
    });

    it("should track modal state correctly", async () => {
      expect(manager.hasActiveModal()).toBe(false);
      expect(manager.getCurrentModalKey()).toBe(null);

      // Start showing modal (don't await to avoid timing issues)
      manager.showModal("test", {});

      expect(manager.hasActiveModal()).toBe(true);
      expect(manager.getCurrentModalKey()).toBe("test");
    });

    it("should return correct queue length", () => {
      expect(manager.getQueueLength()).toBe(0);
      // Queue increases when second modal is requested
      manager.showModal("modal-1", {});
      manager.showModal("modal-2", {});
      expect(manager.getQueueLength()).toBe(1);
    });
  });

  describe("Modal Control", () => {
    it("should close modal", async () => {
      manager.showModal("test", {});
      expect(manager.hasActiveModal()).toBe(true);

      manager.closeModal("result");
      expect(manager.hasActiveModal()).toBe(false);
    });

    it("should dismiss modal", async () => {
      manager.showModal("test", {});
      expect(manager.hasActiveModal()).toBe(true);

      manager.dismissModal("reason");
      expect(manager.hasActiveModal()).toBe(false);
    });

    it("should destroy all modals", () => {
      manager.showModal("modal-1", {});
      manager.showModal("modal-2", {});

      manager.destroyAll();

      expect(manager.hasActiveModal()).toBe(false);
      expect(manager.getQueueLength()).toBe(0);
    });
  });
});
