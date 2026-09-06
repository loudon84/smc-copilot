/**
 * Skill Run contract parser — classification matrix and bind invariant.
 * @lat: [[skill-run#Prompt-first Main validation]]
 */

import { describe, expect, it } from "vitest";
import {
  bindPromptFirstTool,
  classifySkillInvocation,
  mapPublicArtifactDescriptor,
  mapPublicArtifactList,
  mapPublicSkillCatalogTools,
  normalizeSkillToolDescriptor,
  parseSkillRunEvent,
} from "./skill-run-contract-parser";
import type { SkillCatalogToolItem } from "../../shared/skill-run";

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

  it("marks extra required as parameters-required", () => {
    const result = classifySkillInvocation({
      interactionMode: "chat",
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
    expect(result.invocationMode).toBe("parameters-required");
    expect(result.reasonCode).toBe("EXTRA_REQUIRED_PARAMETERS");
    expect(result.callability).toBe("unsupported");
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
      const bind = bindPromptFirstTool(tool.toolName, "hello", tools);
      expect(bind.ok).toBe(true);
      if (bind.ok) {
        expect(bind.promptField).toBeTruthy();
        expect(bind.arguments[bind.promptField]).toBe("hello");
      }
    }
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
