import { describe, expect, it } from "vitest";
import { sortTabsByOrder, isDraggableTabId } from "../src/renderer/src/screens/MainPage/tab-order";

describe("sortTabsByOrder", () => {
  it("orders tabs by tabOrder index", () => {
    const tabs = [
      { id: "external-browser:a" },
      { id: "external-browser:b" },
    ];
    const sorted = sortTabsByOrder(tabs, ["external-browser:b", "external-browser:a"]);
    expect(sorted.map((t) => t.id)).toEqual(["external-browser:b", "external-browser:a"]);
  });

  it("appends unknown ids at end", () => {
    const tabs = [{ id: "external-browser:z" }, { id: "external-browser:a" }];
    const sorted = sortTabsByOrder(tabs, ["external-browser:a"]);
    expect(sorted[0].id).toBe("external-browser:a");
    expect(sorted[1].id).toBe("external-browser:z");
  });
});

describe("isDraggableTabId", () => {
  it("matches external-browser tabs only", () => {
    expect(isDraggableTabId("external-browser:uuid")).toBe(true);
    expect(isDraggableTabId("profile-workspace:coding")).toBe(false);
    expect(isDraggableTabId("web-operator")).toBe(false);
    expect(isDraggableTabId("portal")).toBe(false);
  });
});
