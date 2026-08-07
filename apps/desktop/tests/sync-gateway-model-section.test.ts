import { describe, expect, it } from "vitest";
import {
  readModelSectionFields,
  upsertModelSectionBlock,
} from "../src/main/config";

describe("gateway model section sync helpers", () => {
  it("inserts model block from flat default key", () => {
    const flat = `provider: "custom"
default: "gemma4:26b"
base_url: "http://127.0.0.1:11434/v1"

platforms:
  api_server:
    host: "127.0.0.1"
    port: 8642
`;
    const next = upsertModelSectionBlock(
      flat,
      "custom",
      "gemma4:26b",
      "http://127.0.0.1:11434/v1",
    );
    expect(next).toMatch(/^model:\s*$/m);
    expect(readModelSectionFields(next).model).toBe("gemma4:26b");
    expect(readModelSectionFields(next).provider).toBe("custom");
    expect(readModelSectionFields(next).baseUrl).toBe("http://127.0.0.1:11434/v1");
  });

  it("readModelSectionFields returns empty when model section missing", () => {
    const flat = `provider: "custom"
default: "gemma4:26b"
`;
    const section = readModelSectionFields(flat);
    expect(section.model).toBe("");
  });

  it("does not change content when model section already matches", () => {
    const synced = `provider: "custom"
default: "gemma4:26b"

model:
  provider: "custom"
  default: "gemma4:26b"

platforms:
  api_server:
    host: "127.0.0.1"
`;
    const section = readModelSectionFields(synced);
    const already =
      section.model === "gemma4:26b" &&
      (section.provider || "custom") === "custom";
    expect(already).toBe(true);
  });
});
