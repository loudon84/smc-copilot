import { describe, expect, it } from "vitest";
import { t, getLocaleDirection } from "./index";

describe("shared i18n", () => {
  it("returns English text by default", () => {
    expect(t("welcome.title")).toBe("Welcome to SMC Copilot");
  });

  it("falls back to the key when an English key is missing", () => {
    expect(t("common.missingKey")).toBe("common.missingKey");
  });

  it("returns zh-CN text when available", () => {
    expect(t("welcome.title", "zh-CN")).toBe("欢迎使用 Hermes");
  });

  it("returns zh-TW text when available", () => {
    expect(t("welcome.title", "zh-TW")).toBe("歡迎使用 Hermes");
  });

  it("returns es text when available", () => {
    expect(t("welcome.title", "es")).toBe("Bienvenido a Hermes");
  });

  it("returns id text when available", () => {
    expect(t("welcome.title", "id")).toBe("Selamat datang di Hermes");
  });

  it("returns pl text when available", () => {
    expect(t("welcome.title", "pl")).toBe("Witamy w Hermes");
  });

  it("returns he text when available", () => {
    expect(t("welcome.title", "he")).toBe("ברוכים הבאים ל-Hermes");
  });

  it("reports he as a right-to-left locale", () => {
    expect(getLocaleDirection("he")).toBe("rtl");
    expect(getLocaleDirection("en")).toBe("ltr");
  });

  it("falls back to en when zh-CN key is missing", () => {
    expect(t("nonExistent.fallbackKey", "zh-CN")).toBe(
      "nonExistent.fallbackKey",
    );
  });

  it("falls back to English when zh-CN omits newer skillRun keys", () => {
    // @lat: [[i18n-tests#Missing non-source keys fall back to English]]
    expect(t("skillRun.parametersRequired", "zh-CN")).toBe(
      t("skillRun.parametersRequired", "en"),
    );
    expect(t("skillRun.startDisabledFeatureMode", "zh-CN")).toBe(
      t("skillRun.startDisabledFeatureMode", "en"),
    );
  });

  it("preserves interpolation placeholders in es", () => {
    expect(t("common.updateAvailable", "es", { version: "1.2.3" })).toBe(
      "Actualizar a v1.2.3",
    );
  });

  it("preserves interpolation placeholders in pl", () => {
    expect(t("common.updateAvailable", "pl", { version: "1.2.3" })).toBe(
      "Aktualizacja v1.2.3",
    );
  });

  it("translates skillRun keys in en and zh-CN", () => {
    expect(t("skillRun.runPending", "en")).toBe("Submitting skill request...");
    expect(t("skillRun.runPending", "zh-CN")).toBe("正在提交技能请求...");
    expect(t("skillRun.startDisabledNoLock", "zh-CN")).toBe(
      "缺少契约锁定文件，技能执行已被安全禁用。",
    );
    expect(t("skillRun.parametersRequired", "en")).toBe(
      "This skill requires additional parameters that are not supported yet.",
    );
    expect(t("skillRun.startDisabledFeatureMode", "en")).toBe(
      "Skill Run start is disabled unless feature mode is skill-first.",
    );
  });
});
