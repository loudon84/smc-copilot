/**
 * Skill Run contract parser — classification matrix and bind invariant.
 * @lat: [[skill-run#Prompt-first Main validation]]
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindPromptFirstTool,
  classifySkillInvocation,
  mapPublicArtifactDescriptor,
  mapPublicArtifactList,
  mapPublicSkillCatalogTools,
  normalizeSkillToolDescriptor,
  parseSkillRunEvent,
} from "./skill-run-contract-parser";
import { hasSkillRunStreamingDeltaBundle } from "./skill-run-consumer-lock";
import type { SkillCatalogToolItem } from "../../shared/skill-run";

vi.mock("./skill-run-consumer-lock", () => ({
  hasSkillRunStreamingDeltaBundle: vi.fn(() => true),
}));

function baseDescriptor(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: "writer.article",
    title: "Writer",
    capabilityKind: "skill",
    interactionMode: "chat",
    promptField: "prompt",
    supportsAttachments: false,
    inputSchema: {
      type: "object",
      properties: { prompt: { type: "string" } },
      required: ["prompt"],
    },
    ...overrides,
  };
}

describe("normalizeSkillToolDescriptor", () => {
  it("returns null for connector capabilityKind", () => {
    expect(
      normalizeSkillToolDescriptor(
        baseDescriptor({ capabilityKind: "connector" }),
      ),
    ).toBeNull();
  });

  it("returns null when interactionMode is missing", () => {
    const raw = baseDescriptor();
    delete raw.interactionMode;
    expect(normalizeSkillToolDescriptor(raw)).toBeNull();
  });
});

describe("classifySkillInvocation matrix", () => {
  it("classifies chat + prompt as prompt-first", () => {
    const result = classifySkillInvocation({
      interactionMode: "chat",
      promptField: "prompt",
      inputSchema: {
        type: "object",
        properties: { prompt: { type: "string" } },
        required: ["prompt"],
      },
    });
    expect(result).toEqual({
      invocationMode: "prompt-first",
      callability: "callable",
      promptField: "prompt",
    });
  });

  it("classifies chat + query promptField as prompt-first", () => {
    const result = classifySkillInvocation({
      interactionMode: "chat",
      promptField: "query",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    });
    expect(result.invocationMode).toBe("prompt-first");
    expect(result.promptField).toBe("query");
  });

  it("allows optional scalar properties", () => {
    const result = classifySkillInvocation({
      interactionMode: "chat",
      promptField: "prompt",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          locale: { type: "string" },
        },
        required: ["prompt"],
      },
    });
    expect(result.invocationMode).toBe("prompt-first");
  });

  it("allows optional object properties", () => {
    const result = classifySkillInvocation({
      interactionMode: "chat",
      promptField: "prompt",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          options: { type: "object" },
        },
        required: ["prompt"],
      },
    });
    expect(result.invocationMode).toBe("prompt-first");
  });

  it("allows optional array properties", () => {
    const result = classifySkillInvocation({
      interactionMode: "chat",
      promptField: "prompt",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          tags: { type: "array" },
        },
        required: ["prompt"],
      },
    });
    expect(result.invocationMode).toBe("prompt-first");
  });

  it("classifies extra required strings as limited-parameter-form", () => {
    const result = classifySkillInvocation({
      interactionMode: "chat",
      promptField: "prompt",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          region: { type: "string", title: "Region" },
        },
        required: ["prompt", "region"],
      },
    });
    expect(result.invocationMode).toBe("limited-parameter-form");
    expect(result.callability).toBe("callable");
    expect(result.extraStringFields).toEqual([
      { name: "region", title: "Region" },
    ]);
  });

  it("marks extra required object as parameters-required", () => {
    const result = classifySkillInvocation({
      interactionMode: "chat",
      promptField: "prompt",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          options: { type: "object" },
        },
        required: ["prompt", "options"],
      },
    });
    expect(result.invocationMode).toBe("parameters-required");
    expect(result.reasonCode).toBe("EXTRA_REQUIRED_PARAMETERS");
    expect(result.callability).toBe("unsupported");
  });

  it("rejects more than eight extra required strings", () => {
    const extraNames = Array.from({ length: 9 }, (_, index) => `field${index}`);
    const properties: Record<string, unknown> = {
      prompt: { type: "string" },
    };
    for (const name of extraNames) {
      properties[name] = { type: "string" };
    }
    const result = classifySkillInvocation({
      interactionMode: "chat",
      promptField: "prompt",
      inputSchema: {
        type: "object",
        properties,
        required: ["prompt", ...extraNames],
      },
    });
    expect(result.invocationMode).toBe("parameters-required");
    expect(result.callability).toBe("unsupported");
  });

  it("classifies form plus extra required strings as limited-parameter-form", () => {
    const result = classifySkillInvocation({
      interactionMode: "form",
      promptField: "prompt",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          region: { type: "string" },
        },
        required: ["prompt", "region"],
      },
    });
    expect(result.invocationMode).toBe("limited-parameter-form");
    expect(result.callability).toBe("callable");
    expect(result.extraStringFields).toEqual([{ name: "region" }]);
  });

  it("marks form as form-required", () => {
    const result = classifySkillInvocation({
      interactionMode: "form",
      promptField: "prompt",
      inputSchema: {
        type: "object",
        properties: { prompt: { type: "string" } },
        required: ["prompt"],
      },
    });
    expect(result.invocationMode).toBe("form-required");
    expect(result.reasonCode).toBe("FORM_REQUIRED");
  });

  it("rejects root $ref", () => {
    const result = classifySkillInvocation({
      interactionMode: "chat",
      promptField: "prompt",
      inputSchema: { $ref: "#/definitions/Input" },
    });
    expect(result.reasonCode).toBe("ROOT_SCHEMA_UNSUPPORTED");
  });

  it("rejects root array type", () => {
    const result = classifySkillInvocation({
      interactionMode: "chat",
      promptField: "prompt",
      inputSchema: { type: "array" },
    });
    expect(result.reasonCode).toBe("ROOT_SCHEMA_UNSUPPORTED");
  });

  it.each(["oneOf", "anyOf", "allOf"] as const)(
    "rejects root %s",
    (key) => {
      const result = classifySkillInvocation({
        interactionMode: "chat",
        promptField: "prompt",
        inputSchema: {
          type: "object",
          [key]: [{ type: "object" }],
          properties: { prompt: { type: "string" } },
        },
      });
      expect(result.reasonCode).toBe("COMPOSITE_SCHEMA_UNSUPPORTED");
    },
  );

  it("rejects missing promptField", () => {
    const result = classifySkillInvocation({
      interactionMode: "chat",
      promptField: null,
      inputSchema: {
        type: "object",
        properties: { prompt: { type: "string" } },
        required: ["prompt"],
      },
    });
    expect(result.reasonCode).toBe("PROMPT_FIELD_MISSING");
  });

  it("rejects non-string promptField property", () => {
    const result = classifySkillInvocation({
      interactionMode: "chat",
      promptField: "prompt",
      inputSchema: {
        type: "object",
        properties: { prompt: { type: "number" } },
        required: ["prompt"],
      },
    });
    expect(result.reasonCode).toBe("PROMPT_FIELD_INVALID");
  });
});

describe("mapPublicSkillCatalogTools + bind invariant", () => {
  it("projects interactionMode, promptField, supportsAttachments, invocationMode", () => {
    const tools = mapPublicSkillCatalogTools([
      baseDescriptor({
        promptField: "query",
        supportsAttachments: true,
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      }),
      baseDescriptor({
        name: "form.skill",
        interactionMode: "form",
      }),
      baseDescriptor({ capabilityKind: "connector", name: "conn" }),
    ]);
    expect(tools).toHaveLength(2);
    expect(tools[0]).toEqual(
      expect.objectContaining({
        toolName: "writer.article",
        interactionMode: "chat",
        promptField: "query",
        supportsAttachments: true,
        invocationMode: "prompt-first",
        callability: "callable",
      }),
    );
    expect(tools[1]).toEqual(
      expect.objectContaining({
        toolName: "form.skill",
        invocationMode: "form-required",
        callability: "unsupported",
        reasonCode: "FORM_REQUIRED",
      }),
    );
  });

  it("ensures every callable catalog item binds successfully", () => {
    const tools = mapPublicSkillCatalogTools([
      baseDescriptor(),
      baseDescriptor({
        name: "query.skill",
        promptField: "query",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            options: { type: "object" },
          },
          required: ["query"],
        },
      }),
      baseDescriptor({
        name: "extra.required",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            region: { type: "string" },
          },
          required: ["prompt", "region"],
        },
      }),
    ]);
    const callable = tools.filter((t) => t.callability === "callable");
    expect(callable.length).toBeGreaterThan(0);
    for (const tool of callable) {
      const extras = Object.fromEntries(
        (tool.extraStringFields ?? []).map((field) => [field.name, "value"]),
      );
      const bind = bindPromptFirstTool(tool.toolName, "hello", tools, extras);
      expect(bind.ok).toBe(true);
      if (bind.ok) {
        expect(bind.promptField).toBeTruthy();
        expect(bind.arguments[bind.promptField]).toBe("hello");
      }
    }
  });

  it("binds extra required strings and rejects unknown extra keys", () => {
    const tools = mapPublicSkillCatalogTools([
      baseDescriptor({
        name: "extra.required",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            region: { type: "string" },
          },
          required: ["prompt", "region"],
        },
      }),
    ]);
    expect(tools[0]?.invocationMode).toBe("limited-parameter-form");
    const ok = bindPromptFirstTool("extra.required", "hello", tools, {
      region: "cn",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.arguments).toEqual({ prompt: "hello", region: "cn" });
    }
    const unknown = bindPromptFirstTool("extra.required", "hello", tools, {
      region: "cn",
      forged: "nope",
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.errorCode).toBe("SKILL_PARAMETERS_REQUIRED");
    }
    const missing = bindPromptFirstTool("extra.required", "hello", tools);
    expect(missing.ok).toBe(false);
  });

  it("rejects extra keys on prompt-first bind", () => {
    const tools = mapPublicSkillCatalogTools([baseDescriptor()]);
    const bind = bindPromptFirstTool("writer.article", "hello", tools, {
      region: "cn",
    });
    expect(bind.ok).toBe(false);
  });

  it("binds query promptField into arguments", () => {
    const tools = mapPublicSkillCatalogTools([
      baseDescriptor({
        promptField: "query",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      }),
    ]);
    const bind = bindPromptFirstTool("writer.article", "find customers", tools);
    expect(bind.ok).toBe(true);
    if (bind.ok) {
      expect(bind.arguments).toEqual({ query: "find customers" });
    }
  });

  it("does not send optional properties in bind arguments", () => {
    const tools = mapPublicSkillCatalogTools([
      baseDescriptor({
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            options: { type: "object" },
            tags: { type: "array" },
          },
          required: ["prompt"],
        },
      }),
    ]);
    const bind = bindPromptFirstTool("writer.article", "hello", tools);
    expect(bind.ok).toBe(true);
    if (bind.ok) {
      expect(Object.keys(bind.arguments)).toEqual(["prompt"]);
    }
  });

  it("rejects tampered toolName not in catalog", () => {
    const tools = mapPublicSkillCatalogTools([baseDescriptor()]) as SkillCatalogToolItem[];
    const bind = bindPromptFirstTool("not.published", "hello", tools);
    expect(bind.ok).toBe(false);
    if (!bind.ok) {
      expect(bind.errorCode).toBe("TOOL_NOT_FOUND");
    }
  });
});

const BUNDLE_ARTIFACT = {
  artifact_id: "artifact-1",
  name: "result.txt",
  content_type: "text/plain",
  size_bytes: 12,
  checksum_sha256:
    "4f85f7e7d5d1b8c7a898d0e51fc5de49536c870353302dacfe7d8e6c03e8ad7a",
};

describe("mapPublicArtifactList Bundle v1.2.1", () => {
  it("maps items[] artifact_id/name/checksum_sha256 into internal descriptors", () => {
    const mapped = mapPublicArtifactList({
      run_id: "run-1",
      items: [BUNDLE_ARTIFACT],
    });
    expect(mapped).toEqual([
      {
        id: "artifact-1",
        file_name: "result.txt",
        size_bytes: 12,
        sha256: BUNDLE_ARTIFACT.checksum_sha256,
        mime_type: "text/plain",
      },
    ]);
  });

  it("skips items missing checksum_sha256 instead of inventing a hash", () => {
    expect(
      mapPublicArtifactDescriptor({
        artifact_id: "artifact-1",
        name: "result.txt",
        content_type: "text/plain",
        size_bytes: 12,
      }),
    ).toBeNull();
    expect(
      mapPublicArtifactList({
        run_id: "run-1",
        items: [
          {
            artifact_id: "artifact-1",
            name: "result.txt",
            size_bytes: 12,
          },
        ],
      }),
    ).toEqual([]);
  });

  it("does not accept private-only id/file_name envelopes", () => {
    expect(
      mapPublicArtifactList({
        artifacts: [{ id: "art-1", file_name: "out.txt", preview_supported: true }],
      }),
    ).toEqual([]);
  });

  it("maps run.completed event-carried Bundle artifacts", () => {
    const parsed = parseSkillRunEvent("run.completed", {
      event_id: "evt-1",
      run_id: "run-1",
      event_type: "run.completed",
      event_seq: 3,
      payload: {
        text: "done",
        items: [BUNDLE_ARTIFACT],
      },
    });
    expect(parsed.artifacts).toEqual([
      expect.objectContaining({
        id: "artifact-1",
        file_name: "result.txt",
        sha256: BUNDLE_ARTIFACT.checksum_sha256,
      }),
    ]);
  });

  it("drops private-only artifacts from run.completed events", () => {
    const parsed = parseSkillRunEvent("run.completed", {
      event_id: "evt-1",
      event_type: "run.completed",
      event_seq: 1,
      payload: {
        text: "done",
        artifacts: [{ id: "art-1", file_name: "out.txt" }],
      },
    });
    expect(parsed.artifacts).toBeUndefined();
  });
});

function loadBundleFixture(name: string): Record<string, unknown> {
  const relative = join("contracts", "skill-run", "v1.2.1", "fixtures", name);
  const fromCwd = join(process.cwd(), relative);
  const fromWork = join(process.cwd(), "..", "..", relative);
  const path = existsSync(fromCwd) ? fromCwd : fromWork;
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("parseSkillRunEvent enumerated activity mapping", () => {
  it("maps Bundle reasoning.summary fixture to sanitized activity", () => {
    const fixture = loadBundleFixture("run-event-reasoning-summary.json");
    const parsed = parseSkillRunEvent("reasoning.summary", fixture);
    expect(parsed.rawUnknown).toBeUndefined();
    expect(parsed.activity).toEqual({
      kind: "reasoning.summary",
      summary: "checked docs",
    });
    expect(parsed.text).toBeUndefined();
  });

  it("maps Bundle tool.call fixture without copying extra keys", () => {
    const fixture = loadBundleFixture("run-event-tool-call.json");
    const parsed = parseSkillRunEvent("tool.call", fixture);
    expect(parsed.rawUnknown).toBeUndefined();
    expect(parsed.activity).toEqual({
      kind: "tool.call",
      toolName: "search",
      callId: "call-1",
      status: "started",
    });
    expect(parsed.activity).not.toHaveProperty("arguments");
  });

  it("drops tool.call arguments and never copies secrets", () => {
    const fixture = loadBundleFixture("run-event-tool-call.json");
    const inner = isRecord(fixture.payload)
      ? fixture.payload
      : {};
    const parsed = parseSkillRunEvent("tool.call", {
      ...fixture,
      payload: {
        ...inner,
        arguments: {
          api_key: "jwt-secret",
          url: "https://example.invalid/path",
        },
      },
    });
    expect(parsed.rawUnknown).toBeUndefined();
    expect(parsed.activity).toEqual({
      kind: "tool.call",
      toolName: "search",
      callId: "call-1",
      status: "started",
    });
    const blob = JSON.stringify(parsed);
    expect(blob).not.toContain("arguments");
    expect(blob).not.toContain("jwt-secret");
    expect(blob).not.toContain("https://example.invalid");
  });

  it("maps Bundle clarify.requested fixture to question and string options", () => {
    const fixture = loadBundleFixture("run-event-clarify-requested.json");
    const parsed = parseSkillRunEvent("clarify.requested", fixture);
    expect(parsed.rawUnknown).toBeUndefined();
    expect(parsed.activity).toEqual({
      kind: "clarify.requested",
      question: "which file?",
      options: ["a", "b"],
    });
  });

  it("drops non-string clarify options and does not stringify objects", () => {
    const parsed = parseSkillRunEvent("clarify.requested", {
      event_id: "evt-clarify-dirty",
      event_type: "clarify.requested",
      event_seq: 1,
      payload: {
        question: "pick one",
        options: ["keep", { label: "object-option" }, 3, "", "also"],
      },
    });
    expect(parsed.rawUnknown).toBeUndefined();
    expect(parsed.activity).toEqual({
      kind: "clarify.requested",
      question: "pick one",
      options: ["keep", "also"],
    });
    expect(JSON.stringify(parsed.activity)).not.toContain("object-option");
  });

  it("caps clarify options at eight strings", () => {
    const parsed = parseSkillRunEvent("clarify.requested", {
      event_id: "evt-clarify-cap",
      event_type: "clarify.requested",
      event_seq: 1,
      payload: {
        question: "many",
        options: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
      },
    });
    expect(parsed.activity?.options).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
    ]);
  });

  it("maps Bundle approval.requested fixture to waiting-approval activity", () => {
    const fixture = loadBundleFixture("run-event-approval-requested.json");
    const parsed = parseSkillRunEvent("approval.requested", fixture);
    expect(parsed.rawUnknown).toBeUndefined();
    expect(parsed.phase).toBe("waiting-approval");
    expect(parsed.activity).toEqual({
      kind: "approval.requested",
      approvalId: "appr-1",
      summary: "delete file",
    });
  });

  it("keeps incomplete payloads and illegal tool status as rawUnknown", () => {
    expect(
      parseSkillRunEvent("reasoning.summary", {
        event_type: "reasoning.summary",
        payload: {},
      }).rawUnknown,
    ).toBe(true);
    expect(
      parseSkillRunEvent("tool.call", {
        event_type: "tool.call",
        payload: {
          tool_name: "search",
          call_id: "call-1",
          status: "running",
        },
      }).rawUnknown,
    ).toBe(true);
    expect(
      parseSkillRunEvent("clarify.requested", {
        event_type: "clarify.requested",
        payload: { options: ["a"] },
      }).rawUnknown,
    ).toBe(true);
    expect(
      parseSkillRunEvent("approval.requested", {
        event_type: "approval.requested",
        payload: { summary: "missing id" },
      }).rawUnknown,
    ).toBe(true);
  });

  it("keeps unenumerated and unmapped control events rawUnknown without textifying payload", () => {
    const unknown = parseSkillRunEvent("agent.secret", {
      event_id: "evt-unknown",
      event_type: "agent.secret",
      payload: {
        text: "leak-me",
        token: "jwt-secret",
        arguments: { path: "C:\\\\secret" },
      },
    });
    expect(unknown.rawUnknown).toBe(true);
    expect(unknown.activity).toBeUndefined();
    expect(unknown.text).toBeUndefined();
    const unknownBlob = JSON.stringify(unknown);
    expect(unknownBlob).not.toContain("leak-me");
    expect(unknownBlob).not.toContain("jwt-secret");

    const control = parseSkillRunEvent("run.heartbeat", {
      event_id: "evt-hb",
      event_type: "run.heartbeat",
      payload: { text: "still-alive", message: "do-not-copy" },
    });
    expect(control.rawUnknown).toBe(true);
    expect(control.activity).toBeUndefined();
    expect(control.text).toBeUndefined();
    expect(JSON.stringify(control)).not.toContain("still-alive");
  });
});

function loadV15Fixture(name: string): Record<string, unknown> {
  const relative = join("contracts", "skill-run", "v1.5.0", "fixtures", name);
  const fromCwd = join(process.cwd(), relative);
  const fromWork = join(process.cwd(), "..", "..", relative);
  const path = existsSync(fromCwd) ? fromCwd : fromWork;
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("parseSkillRunEvent enumerated assistant.delta mapping", () => {
  beforeEach(() => {
    vi.mocked(hasSkillRunStreamingDeltaBundle).mockReturnValue(true);
  });

  it("maps v1.5 assistant.delta fixture to sanitized fields without text or activity", () => {
    const fixture = loadV15Fixture("run-event-assistant-delta.json");
    const parsed = parseSkillRunEvent("assistant.delta", fixture);
    expect(parsed.rawUnknown).toBeUndefined();
    expect(parsed.messageId).toBe("msg_opaque_001");
    expect(parsed.deltaSeq).toBe(1);
    expect(parsed.deltaText).toBe("正在分析");
    expect(parsed.text).toBeUndefined();
    expect(parsed.activity).toBeUndefined();
  });

  it("keeps v1.5 assistant.message snapshot text and optional messageId", () => {
    const fixture = loadV15Fixture("run-event-assistant-message.json");
    const parsed = parseSkillRunEvent("assistant.message", fixture);
    expect(parsed.rawUnknown).toBeUndefined();
    expect(parsed.text).toBe("正在分析完整结果");
    expect(parsed.messageId).toBe("msg_opaque_001");
    expect(parsed.deltaText).toBeUndefined();
    expect(parsed.activity).toBeUndefined();
  });

  it("keeps snapshot replace-all when message_id is missing", () => {
    const parsed = parseSkillRunEvent("assistant.message", {
      event_type: "assistant.message",
      payload: { text: "legacy snapshot" },
    });
    expect(parsed.rawUnknown).toBeUndefined();
    expect(parsed.text).toBe("legacy snapshot");
    expect(parsed.messageId).toBeUndefined();
  });

  it("keeps missing, empty, non-string, and non-positive seq payloads rawUnknown", () => {
    const basePayload = {
      message_id: "msg_opaque_001",
      delta_seq: 1,
      delta: "正在分析",
    };
    const cases: Record<string, unknown>[] = [
      { ...basePayload, message_id: undefined },
      { ...basePayload, message_id: "   " },
      { ...basePayload, delta_seq: undefined },
      { ...basePayload, delta_seq: 0 },
      { ...basePayload, delta_seq: 1.5 },
      { ...basePayload, delta: undefined },
      { ...basePayload, delta: 12 },
    ];
    for (const payload of cases) {
      const parsed = parseSkillRunEvent("assistant.delta", {
        event_type: "assistant.delta",
        payload,
      });
      expect(parsed.rawUnknown).toBe(true);
      expect(parsed.text).toBeUndefined();
      expect(parsed.deltaText).toBeUndefined();
      expect(parsed.activity).toBeUndefined();
    }
  });

  it("keeps assistant.delta rawUnknown when streaming-delta eligibility is false", () => {
    vi.mocked(hasSkillRunStreamingDeltaBundle).mockReturnValue(false);
    const fixture = loadV15Fixture("run-event-assistant-delta.json");
    const parsed = parseSkillRunEvent("assistant.delta", fixture);
    expect(parsed.rawUnknown).toBe(true);
    expect(parsed.text).toBeUndefined();
    expect(parsed.deltaText).toBeUndefined();
    expect(parsed.activity).toBeUndefined();
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
