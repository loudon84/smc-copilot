import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { setLocale, SOURCE_LOCALE } from "../../../shared/i18n";

// Assertions use English source copy. The product default locale stays zh-CN.
// Pin the runner so jsdom does not render the machine locale. Node-environment
// suites have no localStorage; shared i18n still switches to English.
function pinSourceLocale(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("hermes-locale", SOURCE_LOCALE);
  }
  setLocale(SOURCE_LOCALE);
}

pinSourceLocale();

// Mock thinking-orbs — its canvas/IntersectionObserver rendering has no
// jsdom equivalent.
vi.mock("thinking-orbs", () => ({
  ThinkingOrb: () => null,
}));

beforeEach(() => {
  pinSourceLocale();
});

afterEach(() => {
  cleanup();
});
