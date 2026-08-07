import { describe, it, expect, vi, beforeEach } from "vitest";

const mockWebContents = {
  send: vi.fn(),
};

const mockBrowserWindow = {
  webContents: mockWebContents,
  getBounds: vi.fn().mockReturnValue({ width: 1280, height: 800 }),
};

describe("DropdownManager", () => {
  let DropdownManager: any;
  let manager: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import("../src/main/shell/overlays/dropdown-manager");
    DropdownManager = module.DropdownManager;
    manager = new DropdownManager(mockBrowserWindow as any);
  });

  describe("Basic Operations", () => {
    it("should create a DropdownManager instance", () => {
      expect(manager).toBeDefined();
    });

    it("should show a dropdown and send IPC", () => {
      const anchorBounds = { x: 100, y: 100, width: 200, height: 30 };
      manager.showDropdown("gateway-status", { anchorBounds }, { running: true });

      expect(mockWebContents.send).toHaveBeenCalledWith("dropdown:show", {
        key: "gateway-status",
        anchorBounds,
        preferredDirection: "down",
        data: { running: true },
      });
      expect(manager.isDropdownVisible("gateway-status")).toBe(true);
    });

    it("should close a dropdown", () => {
      manager.showDropdown("gateway-status", { anchorBounds: { x: 0, y: 0, width: 100, height: 30 } });
      manager.closeDropdown("gateway-status");

      expect(mockWebContents.send).toHaveBeenCalledWith("dropdown:close", {
        key: "gateway-status",
      });
      expect(manager.isDropdownVisible("gateway-status")).toBe(false);
    });

    it("should close all dropdowns", () => {
      manager.showDropdown("dropdown-1", { anchorBounds: { x: 0, y: 0, width: 100, height: 30 } });
      manager.showDropdown("dropdown-2", { anchorBounds: { x: 0, y: 0, width: 100, height: 30 } });

      manager.closeAll();

      expect(mockWebContents.send).toHaveBeenCalledWith("dropdown:close-all");
    });

    it("should toggle dropdown", () => {
      const position = { anchorBounds: { x: 0, y: 0, width: 100, height: 30 } };

      manager.toggleDropdown("test-dropdown", position);
      expect(manager.isDropdownVisible("test-dropdown")).toBe(true);

      manager.toggleDropdown("test-dropdown", position);
      expect(manager.isDropdownVisible("test-dropdown")).toBe(false);
    });
  });

  describe("Position Calculation", () => {
    it("should calculate position with default direction", () => {
      const anchorBounds = { x: 100, y: 100, width: 200, height: 30 };
      const dropdownSize = { width: 300, height: 200 };

      const position = manager.calculatePosition(anchorBounds, dropdownSize);

      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeGreaterThanOrEqual(0);
    });

    it("should handle window boundary", () => {
      const anchorBounds = { x: 1200, y: 100, width: 100, height: 30 };
      const dropdownSize = { width: 300, height: 200 };

      const position = manager.calculatePosition(anchorBounds, dropdownSize);

      expect(position.x).toBeLessThanOrEqual(1280 - 300);
    });

    it("should calculate for different directions", () => {
      const anchorBounds = { x: 100, y: 100, width: 200, height: 30 };
      const dropdownSize = { width: 200, height: 150 };

      const downPos = manager.calculatePosition(anchorBounds, dropdownSize, "down");
      expect(downPos.y).toBeGreaterThan(anchorBounds.y);

      const upPos = manager.calculatePosition(anchorBounds, dropdownSize, "up");
      expect(upPos.y).toBeLessThan(anchorBounds.y);
    });
  });

  describe("State Management", () => {
    it("should get dropdown state", () => {
      expect(manager.getDropdownState("test")).toBe("hidden");

      manager.showDropdown("test", { anchorBounds: { x: 0, y: 0, width: 100, height: 30 } });
      expect(manager.getDropdownState("test")).toBe("visible");

      manager.closeDropdown("test");
      expect(manager.getDropdownState("test")).toBe("hidden");
    });

    it("should get active dropdowns", () => {
      expect(manager.getActiveDropdowns()).toEqual([]);

      manager.showDropdown("dropdown-1", { anchorBounds: { x: 0, y: 0, width: 100, height: 30 } });
      manager.showDropdown("dropdown-2", { anchorBounds: { x: 0, y: 0, width: 100, height: 30 } });

      const active = manager.getActiveDropdowns();
      expect(active).toContain("dropdown-1");
      expect(active).toContain("dropdown-2");
    });
  });

  describe("Destroy", () => {
    it("should destroy all and cleanup", () => {
      manager.showDropdown("dropdown-1", { anchorBounds: { x: 0, y: 0, width: 100, height: 30 } });

      manager.destroyAll();

      expect(manager.getActiveDropdowns()).toEqual([]);
    });
  });
});
