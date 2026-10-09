import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACTIVE_LOCALE,
  getLocaleDirection,
  setLocale,
  sharedI18n,
  t,
} from "./index";
import knowledgeEn from "./locales/en/knowledge";

describe("shared i18n", () => {
  it("returns zh-CN text for the product default locale", () => {
    setLocale(DEFAULT_ACTIVE_LOCALE);
    expect(t("welcome.title")).toBe("欢迎使用 SMC Copilot");
  });

  it("falls back to the key when an English key is missing", () => {
    expect(t("common.missingKey")).toBe("common.missingKey");
  });

  it("returns zh-CN text when available", () => {
    expect(t("welcome.title", "zh-CN")).toBe("欢迎使用 SMC Copilot");
  });

  it("shows Chinese upload labels without falling back to English", () => {
    const translateChinese = sharedI18n.getFixedT("zh-CN");
    const checkTranslations = (node: object, prefix: string): void => {
      for (const [name, value] of Object.entries(node)) {
        const key = `${prefix}.${name}`;
        if (typeof value === "string") {
          expect(translateChinese(key), key).not.toBe(value);
          expect(translateChinese(key), key).toMatch(/[\u3400-\u9fff]/);
        } else if (value && typeof value === "object") {
          checkTranslations(value, key);
        }
      }
    };
    checkTranslations(knowledgeEn.uploads, "knowledge.uploads");
    expect(translateChinese("knowledge.uploads.pickerLabel")).toBe("选择文件");
    expect(translateChinese("knowledge.uploads.progressLabel")).toBe(
      "处理阶段进度",
    );
    expect(translateChinese("knowledge.uploads.summary.completed")).toBe(
      "已加入知识库",
    );
    expect(
      translateChinese("knowledge.uploads.status.awaiting_confirmation"),
    ).toBe("待确认");
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

  it("falls back to English when a non-source locale omits a key", () => {
    // @lat: [[i18n-tests#Missing non-source keys fall back to English]]
    // pl does not register the diagnose namespace; t() falls back to English.
    expect(t("diagnose.title", "pl")).toBe(t("diagnose.title", "en"));
  });

  it("serves translated skillRun keys in zh-CN after administrator sync", () => {
    expect(t("skillRun.parametersRequired", "zh-CN")).toBe(
      "此技能需要尚不支持的额外参数。",
    );
    expect(t("skillRun.startDisabledFeatureMode", "zh-CN")).toBe(
      "仅在技能优先（skill-first）功能模式下才可启动 Skill Run。",
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
