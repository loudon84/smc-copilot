import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const USER_DATA = "E:/tmp/work-skill-run-mode-test";

vi.mock("electron", () => ({
  app: {
    getPath: () => USER_DATA,
  },
}));

import { getSkillRunFeatureMode, setSkillRunFeatureMode } from "./feature-mode-store";

const STORE_FILE = join(USER_DATA, "skill-run-feature-mode.json");

describe("feature-mode-store", () => {
  const previousEnv = process.env.SMC_WORK_SKILL_RUN_MODE;

  beforeEach(() => {
    delete process.env.SMC_WORK_SKILL_RUN_MODE;
    mkdirSync(USER_DATA, { recursive: true });
    if (existsSync(STORE_FILE)) {
      rmSync(STORE_FILE);
    }
  });

  afterEach(() => {
    if (previousEnv === undefined) {
      delete process.env.SMC_WORK_SKILL_RUN_MODE;
    } else {
      process.env.SMC_WORK_SKILL_RUN_MODE = previousEnv;
    }
    if (existsSync(STORE_FILE)) {
      rmSync(STORE_FILE);
    }
  });

  it("defaults to skill-first when env and store file are absent", () => {
    expect(getSkillRunFeatureMode()).toBe("skill-first");
  });

  it("lets SMC_WORK_SKILL_RUN_MODE roll back new submits to expert-compat", () => {
    process.env.SMC_WORK_SKILL_RUN_MODE = "expert-compat";
    expect(getSkillRunFeatureMode()).toBe("expert-compat");
  });

  it("lets SMC_WORK_SKILL_RUN_MODE roll back new submits to local-only", () => {
    process.env.SMC_WORK_SKILL_RUN_MODE = "local-only";
    expect(getSkillRunFeatureMode()).toBe("local-only");
  });

  it("maps legacy skill-only env alias to local-only", () => {
    process.env.SMC_WORK_SKILL_RUN_MODE = "skill-only";
    expect(getSkillRunFeatureMode()).toBe("local-only");
  });

  it("ignores invalid env and falls through to the production default", () => {
    process.env.SMC_WORK_SKILL_RUN_MODE = "not-a-mode";
    expect(getSkillRunFeatureMode()).toBe("skill-first");
  });

  it("reads an explicit store file when env is unset", () => {
    writeFileSync(
      STORE_FILE,
      JSON.stringify({ mode: "expert-compat", updatedAt: "2026-09-06T00:00:00.000Z" }),
      "utf-8",
    );
    expect(getSkillRunFeatureMode()).toBe("expert-compat");
  });

  it("lets setSkillRunFeatureMode persist a rollback mode", () => {
    setSkillRunFeatureMode("expert-compat");
    expect(getSkillRunFeatureMode()).toBe("expert-compat");
  });
});
