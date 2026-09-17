import { afterEach, describe, expect, it } from "vitest";
import {
  readRootWorkThemeId,
  resolveModuleTheme,
} from "../components/common/resolve-module-theme";

describe("resolveModuleTheme", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
  });

  it("maps Work theme ids by appearance, not by id === light", () => {
    expect(resolveModuleTheme("light")).toBe("light");
    expect(resolveModuleTheme("dark")).toBe("dark");
    expect(resolveModuleTheme("github-light")).toBe("light");
    expect(resolveModuleTheme("solarized-light")).toBe("light");
    expect(resolveModuleTheme("dracula")).toBe("dark");
    expect(resolveModuleTheme("unknown")).toBe("dark");
    expect(resolveModuleTheme(null)).toBe("dark");
  });

  it("reads html data-theme without writing classList", () => {
    document.documentElement.setAttribute("data-theme", "github-light");
    expect(readRootWorkThemeId()).toBe("github-light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
