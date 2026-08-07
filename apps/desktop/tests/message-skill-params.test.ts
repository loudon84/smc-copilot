import { describe, expect, it } from "vitest";
import { appendSkillParamsJsonBlock } from "../src/main/hermes-default-chat/message-skill-params";

const USER_MSG =
  "使用 contact_to_order 解析附件，issmple=1，callbackURL=http://192.168.99.35:8080/sdms/om/sdms_om_main/sdmsOmMain.do?method=addSoDesktop&tempType=";

const EXPECTED_CALLBACK =
  "http://192.168.99.35:8080/sdms/om/sdms_om_main/sdmsOmMain.do?method=addSoDesktop&tempType=";

const USER_MSG_ASCII_COMMA =
  "使用 contact_to_order 解析附件，issmple=1,callbackURL=http://192.168.99.35:8080/sdms/om/sdms_om_main/sdmsOmMain.do?method=addSoDesktop&tempType=";

function parseSkillParamsJsonBlock(out: string): Record<string, string> {
  const jsonStart = out.indexOf("[SkillParamsJSON]\n") + "[SkillParamsJSON]\n".length;
  const jsonEnd = out.indexOf("\n\n[CallbackURLBuild]", jsonStart);
  const jsonText = jsonEnd === -1 ? out.slice(jsonStart) : out.slice(jsonStart, jsonEnd);
  return JSON.parse(jsonText) as Record<string, string>;
}

describe("appendSkillParamsJsonBlock", () => {
  it("passes callbackURL verbatim; does not emit parsed query fields", () => {
    const out = appendSkillParamsJsonBlock(USER_MSG);
    const params = parseSkillParamsJsonBlock(out);

    expect(params.issmple).toBe("1");
    expect(params.callbackURL).toBe(EXPECTED_CALLBACK);
    expect(params).not.toHaveProperty("callbackUrl");
    expect(params).not.toHaveProperty("method");
    expect(params).not.toHaveProperty("tempType");
    expect(out).toContain("[CallbackURLBuild]");
    expect(out).toContain("禁止 &amp;");
  });

  it("does not duplicate callbackUrl key when user types callbackURL", () => {
    const out = appendSkillParamsJsonBlock(USER_MSG_ASCII_COMMA);
    const params = parseSkillParamsJsonBlock(out);

    expect(Object.keys(params).sort()).toEqual(["callbackURL", "issmple"]);
    expect(params.callbackURL).toBe(EXPECTED_CALLBACK);
  });
});
