// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { AccessTokenError } from "../auth/ensure-access-token";
import { AuthorizedBackendTransportError } from "../auth/authorized-backend-transport";
import { KNOWLEDGE_ERROR_CODES } from "../../shared/knowledge/knowledge-base-ipc";
import { KnowledgeFacadeError } from "../../shared/knowledge/knowledge-errors";
import {
  createKnowledgeHttpProvider,
  resetKnowledgeHttpProviderForTests,
} from "./knowledge-http-provider";
import type { KnowledgeAuthorizedTransport } from "./knowledge-authorized-transport";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function transport(
  handler: (path: string, init?: RequestInit) => Promise<Response>,
): KnowledgeAuthorizedTransport {
  return {
    getBaseUrl: () => "http://knowledge.test",
    joinUrl: (path) => `http://knowledge.test${path}`,
    authorizedFetch: (path, init) => handler(path, init),
    withAuthRetry: (op) => op(),
  };
}

const validBase = {
  id: "kb_1",
  org_id: "org",
  name: "Alpha",
  description: null,
  embedding_model: "emb",
  chunk_method: "naive",
  status: "active",
  owner_member_id: "m1",
  acl_version: 1,
  visibility: "organization",
  build_version: 1,
};

describe("KnowledgeHttpProvider", () => {
  afterEach(() => {
    resetKnowledgeHttpProviderForTests();
  });

  it("lists bases after schema validation", async () => {
    const provider = createKnowledgeHttpProvider(
      transport(async () =>
        jsonResponse(200, {
          code: 0,
          message: "ok",
          data: { items: [validBase], total: 1, page: 1, page_size: 50 },
        }),
      ),
    );
    const page = await provider.listBases({ page: 1, pageSize: 50 });
    expect(page.items[0]?.name).toBe("Alpha");
    expect(page.total).toBe(1);
  });

  it("downloads source file bytes via F10 (DH-01 active version)", async () => {
    const seen: Array<{ path: string; timeoutMs?: number }> = [];
    const provider = createKnowledgeHttpProvider({
      getBaseUrl: () => "http://knowledge.test",
      joinUrl: (path) => `http://knowledge.test${path}`,
      withAuthRetry: (op) => op(),
      authorizedFetch: async (path, init) => {
        seen.push({
          path,
          timeoutMs: (init as { timeoutMs?: number } | undefined)?.timeoutMs,
        });
        return new Response(new Uint8Array([10, 20, 30]), {
          status: 200,
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": 'attachment; filename="note.md"',
          },
        });
      },
    });
    const result = await provider.downloadSourceFile({ sourceFileId: "sf-1" });
    expect(seen[0]?.path).toContain("/api/v1/source-files/sf-1/download");
    expect(seen[0]?.timeoutMs).toBe(60_000);
    expect([...result.bytes]).toEqual([10, 20, 30]);
    expect(result.fileName).toBe("note.md");
  });

  it("maps F10 download 404 to NOT_FOUND", async () => {
    const provider = createKnowledgeHttpProvider(
      transport(async () => jsonResponse(404, { message_key: "missing" })),
    );
    await expect(
      provider.downloadSourceFile({ sourceFileId: "missing" }),
    ).rejects.toMatchObject({ code: KNOWLEDGE_ERROR_CODES.NOT_FOUND });
  });

  it("maps 401/403/404/409/5xx and malformed payloads", async () => {
    const cases: Array<[number, string, unknown]> = [
      [401, KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED, { message_key: "errors.auth" }],
      [403, KNOWLEDGE_ERROR_CODES.FORBIDDEN, { message_key: "errors.forbidden" }],
      [404, KNOWLEDGE_ERROR_CODES.NOT_FOUND, { message_key: "errors.missing" }],
      [409, KNOWLEDGE_ERROR_CODES.CONFLICT, { message_key: "errors.conflict" }],
      [503, KNOWLEDGE_ERROR_CODES.UNAVAILABLE, { message_key: "errors.down" }],
    ];
    for (const [status, code, body] of cases) {
      const provider = createKnowledgeHttpProvider(
        transport(async () => jsonResponse(status, body)),
      );
      await expect(provider.getBase({ knowledgeBaseId: "kb_1" })).rejects.toMatchObject({
        code,
      });
    }

    const malformed = createKnowledgeHttpProvider(
      transport(async () => new Response("{not-json", { status: 200 })),
    );
    await expect(malformed.listBases()).rejects.toMatchObject({
      code: KNOWLEDGE_ERROR_CODES.CONTRACT_INVALID,
    });
  });

  it("does not auto-retry a timed-out non-idempotent POST", async () => {
    let calls = 0;
    const provider = createKnowledgeHttpProvider(
      transport(async () => {
        calls += 1;
        throw new AuthorizedBackendTransportError("aborted", {
          status: 0,
          errorCode: "FETCH_ABORTED",
        });
      }),
    );
    await expect(
      provider.createBase({ name: "New", visibility: "organization" }),
    ).rejects.toBeInstanceOf(KnowledgeFacadeError);
    expect(calls).toBe(1);
  });

  it("maps a missing Work session to auth_required instead of unavailable", async () => {
    const provider = createKnowledgeHttpProvider(
      transport(async () => {
        throw new AccessTokenError("Not authenticated", "UNAUTHORIZED");
      }),
    );
    await expect(provider.probeCapability()).resolves.toEqual({
      available: false,
      status: "auth_required",
    });
  });

  it("maps capability 401 to auth_required and connection failure to unavailable", async () => {
    const auth = createKnowledgeHttpProvider(
      transport(async () => jsonResponse(401, { message_key: "errors.auth" })),
    );
    await expect(auth.probeCapability()).resolves.toEqual({
      available: false,
      status: "auth_required",
    });

    const down = createKnowledgeHttpProvider(
      transport(async () => {
        throw new AuthorizedBackendTransportError("down", {
          status: 0,
          errorCode: "FETCH_FAILED",
        });
      }),
    );
    await expect(down.probeCapability()).resolves.toEqual({
      available: false,
      status: "blocked_provider_unavailable",
    });
  });
});

describe("knowledge schema fail-closed", () => {
  it("rejects invalid contract payloads", async () => {
    const { parseKnowledgeBaseSnapshot } = await import("./knowledge-schema");
    expect(() => parseKnowledgeBaseSnapshot({ id: "x" })).toThrowError(
      /KNOWLEDGE_CONTRACT_INVALID/,
    );
  });

  it("parses source-file activeVersionId and refuses to invent it", async () => {
    const {
      parseKnowledgeBaseFileSnapshot,
    } = await import("./knowledge-schema");
    const parsed = parseKnowledgeBaseFileSnapshot({
      id: "sf-1",
      knowledge_base_id: "kb_1",
      file_name: "notes.pdf",
      status: "active",
      active_version_id: "ver-9",
      owner_member_id: "file-owner-1",
      created_at: "2026-01-03T00:00:00.000Z",
      dataset_id: "ds-hidden",
      ragflow_document_id: "rf-hidden",
    });
    expect(parsed.activeVersionId).toBe("ver-9");
    expect(parsed.ownerMemberId).toBe("file-owner-1");
    expect(parsed.createdAt).toBe("2026-01-03T00:00:00.000Z");
    expect(parsed).not.toHaveProperty("dataset_id");
    expect(parsed).not.toHaveProperty("ragflow_document_id");
    expect(
      parseKnowledgeBaseFileSnapshot({
        id: "sf-2",
        knowledge_base_id: "kb_1",
        file_name: "notes.pdf",
        status: "active",
      }).activeVersionId,
    ).toBeNull();
  });

  it("maps owner and created fields from contract payloads", async () => {
    const {
      parseKnowledgeBaseSnapshot,
      parseKnowledgeFileVersionSnapshot,
    } = await import("./knowledge-schema");
    const base = parseKnowledgeBaseSnapshot({
      id: "kb_1",
      name: "Alpha",
      status: "active",
      visibility: "organization",
      owner_member_id: "m1",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    expect(base.ownerMemberId).toBe("m1");
    expect(base.createdAt).toBe("2026-01-02T00:00:00.000Z");
    const version = parseKnowledgeFileVersionSnapshot({
      id: "ver-1",
      source_file_id: "sf-1",
      version_no: 1,
      parse_status: "active",
      created_at: "2026-01-04T00:00:00.000Z",
      uploaded_by_member_id: "uploader-1",
    });
    expect(version.createdAt).toBe("2026-01-04T00:00:00.000Z");
    expect(version.uploadedByMemberId).toBe("uploader-1");
  });

  it("requires both chunk flags before retrieval-ready", async () => {
    const { parseKnowledgeIndexStates } = await import("./knowledge-schema");
    const { isKnowledgeIndexRetrievalReady } = await import(
      "../../shared/knowledge/knowledge-base-ipc"
    );
    const states = parseKnowledgeIndexStates({
      data: {
        chunk: { build_status: "ready", retrieval_status: "unavailable" },
      },
    });
    expect(isKnowledgeIndexRetrievalReady(states[0]!)).toBe(false);
    const ready = parseKnowledgeIndexStates({
      data: {
        chunk: { build_status: "ready", retrieval_status: "ready" },
      },
    });
    expect(isKnowledgeIndexRetrievalReady(ready[0]!)).toBe(true);
  });

  it("parses knowledge set and retrieval profile snapshots fail-closed", async () => {
    const {
      parseKnowledgeSetSnapshot,
      parseKnowledgeRetrievalProfileSnapshot,
    } = await import("./knowledge-schema");
    const set = parseKnowledgeSetSnapshot({
      id: "ks_1",
      name: "Alpha Set",
      description: null,
      status: "active",
      visibility: "organization",
      owner_member_id: "m1",
      usage_count: 3,
      last_used_at: "2026-01-05T00:00:00.000Z",
      knowledge_bases: [
        { knowledge_base_id: "kb_1", name: "Base", weight: 1.5 },
      ],
      dataset_id: "ds-hidden",
    });
    expect(set).toMatchObject({
      id: "ks_1",
      name: "Alpha Set",
      status: "active",
      usageCount: 3,
      ownerMemberId: "m1",
      lastUsedAt: "2026-01-05T00:00:00.000Z",
      knowledgeBases: [{ knowledgeBaseId: "kb_1", name: "Base", weight: 1.5 }],
    });
    expect(set).not.toHaveProperty("dataset_id");
    expect(() =>
      parseKnowledgeSetSnapshot({ id: "ks_1", name: "x", status: "bogus" }),
    ).toThrowError(/KNOWLEDGE_CONTRACT_INVALID/);

    const profile = parseKnowledgeRetrievalProfileSnapshot({
      id: "rp_1",
      knowledge_set_id: "ks_1",
      version: 2,
      config: { top_k: 4 },
      status: "draft",
      created_by_member_id: "m2",
      ragflow_id: "rf-hidden",
    });
    expect(profile).toMatchObject({
      id: "rp_1",
      knowledgeSetId: "ks_1",
      version: 2,
      status: "draft",
      config: { top_k: 4 },
      createdByMemberId: "m2",
    });
    expect(profile).not.toHaveProperty("ragflow_id");
    expect(() =>
      parseKnowledgeRetrievalProfileSnapshot({
        id: "rp_1",
        knowledge_set_id: "ks_1",
        version: 1,
        status: "nope",
      }),
    ).toThrowError(/KNOWLEDGE_CONTRACT_INVALID/);
  });
});

describe("KnowledgeHttpProvider sets and retrieval profiles", () => {
  afterEach(() => {
    resetKnowledgeHttpProviderForTests();
  });

  it("calls set and retrieval-profile contract paths", async () => {
    const seen: string[] = [];
    const validSet = {
      id: "ks_1",
      name: "Alpha Set",
      description: null,
      status: "active",
      visibility: "organization",
      usage_count: 0,
      knowledge_bases: [{ knowledge_base_id: "kb_1", weight: 1 }],
    };
    const validProfile = {
      id: "rp_1",
      knowledge_set_id: "ks_1",
      version: 1,
      config: { top_k: 3 },
      status: "draft",
    };
    const provider = createKnowledgeHttpProvider(
      transport(async (path, init) => {
        seen.push(`${init?.method ?? "GET"} ${path}`);
        if (path.startsWith("/api/v2/knowledge-sets?") && (init?.method ?? "GET") === "GET") {
          return jsonResponse(200, {
            data: { items: [validSet], total: 1, page: 1, page_size: 50 },
          });
        }
        if (
          path === "/api/v2/knowledge-sets" &&
          init?.method === "POST"
        ) {
          return jsonResponse(200, { data: validSet });
        }
        if (
          path === "/api/v2/knowledge-sets/ks_1" &&
          init?.method === "PATCH"
        ) {
          return jsonResponse(200, { data: { ...validSet, name: "Renamed" } });
        }
        if (
          path === "/api/v2/knowledge-sets/ks_1/knowledge-bases" &&
          init?.method === "POST"
        ) {
          return jsonResponse(200, { data: null });
        }
        if (
          path === "/api/v2/knowledge-sets/ks_1/knowledge-bases/kb_1" &&
          init?.method === "DELETE"
        ) {
          return jsonResponse(200, { data: null });
        }
        if (path === "/api/v2/knowledge-sets/ks_1") {
          return jsonResponse(200, { data: validSet });
        }
        if (
          path === "/api/v1/knowledge-sets/ks_1/retrieval-profiles" &&
          init?.method === "POST"
        ) {
          return jsonResponse(200, { data: validProfile });
        }
        if (path === "/api/v1/knowledge-sets/ks_1/retrieval-profiles") {
          return jsonResponse(200, { data: { items: [validProfile] } });
        }
        if (path.endsWith("/publish") || path.endsWith("/rollback")) {
          return jsonResponse(200, {
            data: { ...validProfile, status: "active" },
          });
        }
        if (path === "/api/v1/retrieval-profiles/rp_1" && init?.method === "PATCH") {
          return jsonResponse(200, {
            data: { ...validProfile, config: { top_k: 5 } },
          });
        }
        if (path === "/api/v1/retrieval-profiles/rp_1") {
          return jsonResponse(200, { data: validProfile });
        }
        return jsonResponse(404, { message_key: "missing" });
      }),
    );

    await expect(provider.listSets()).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "ks_1" })],
      total: 1,
    });
    await expect(
      provider.createSet({ name: "Alpha Set" }),
    ).resolves.toMatchObject({ id: "ks_1" });
    await expect(
      provider.updateSet({ knowledgeSetId: "ks_1", name: "Renamed" }),
    ).resolves.toMatchObject({ name: "Renamed" });
    await expect(
      provider.bindSetBase({ knowledgeSetId: "ks_1", knowledgeBaseId: "kb_1" }),
    ).resolves.toMatchObject({ id: "ks_1" });
    await expect(
      provider.unbindSetBase({
        knowledgeSetId: "ks_1",
        knowledgeBaseId: "kb_1",
      }),
    ).resolves.toMatchObject({ id: "ks_1" });
    await expect(
      provider.listRetrievalProfiles({ knowledgeSetId: "ks_1" }),
    ).resolves.toEqual([expect.objectContaining({ id: "rp_1" })]);
    await expect(
      provider.createRetrievalProfile({
        knowledgeSetId: "ks_1",
        config: { top_k: 3 },
      }),
    ).resolves.toMatchObject({ id: "rp_1", status: "draft" });
    await expect(
      provider.updateRetrievalProfile({
        profileId: "rp_1",
        config: { top_k: 5 },
      }),
    ).resolves.toMatchObject({ config: { top_k: 5 } });
    await expect(
      provider.publishRetrievalProfile({ profileId: "rp_1" }),
    ).resolves.toMatchObject({ status: "active" });
    await expect(
      provider.rollbackRetrievalProfile({ profileId: "rp_1", publish: true }),
    ).resolves.toMatchObject({ status: "active" });

    expect(seen).toContain("GET /api/v2/knowledge-sets?page=1&page_size=50");
    expect(seen).toContain("POST /api/v2/knowledge-sets");
    expect(seen).toContain("POST /api/v2/knowledge-sets/ks_1/knowledge-bases");
    expect(seen).toContain(
      "DELETE /api/v2/knowledge-sets/ks_1/knowledge-bases/kb_1",
    );
    expect(seen).toContain(
      "GET /api/v1/knowledge-sets/ks_1/retrieval-profiles",
    );
    expect(seen).toContain("POST /api/v1/retrieval-profiles/rp_1/publish");
    expect(seen).toContain("POST /api/v1/retrieval-profiles/rp_1/rollback");
  });
});

describe("KnowledgeHttpProvider source file and build", () => {
  afterEach(() => {
    resetKnowledgeHttpProviderForTests();
  });

  it("calls source-file lifecycle and index/build contract paths", async () => {
    const seen: string[] = [];
    const provider = createKnowledgeHttpProvider(
      transport(async (path, init) => {
        seen.push(`${init?.method ?? "GET"} ${path}`);
        if (path.includes("/versions/") && path.endsWith("/activate")) {
          return jsonResponse(200, {
            data: {
              id: "sf-1",
              knowledge_base_id: "kb_1",
              file_name: "notes.pdf",
              status: "active",
              active_version_id: "ver-2",
            },
          });
        }
        if (path.endsWith("/versions") && init?.method === "GET") {
          return jsonResponse(200, {
            data: {
              items: [
                {
                  id: "ver-1",
                  source_file_id: "sf-1",
                  version_no: 1,
                  parse_status: "active",
                },
              ],
            },
          });
        }
        if (path.includes("/archive") || path.includes("/unarchive") || path.includes("/reparse")) {
          return jsonResponse(200, {
            data: {
              id: "sf-1",
              knowledge_base_id: "kb_1",
              file_name: "notes.pdf",
              status: "active",
              active_version_id: "ver-1",
            },
          });
        }
        if (path.includes("/indexes")) {
          return jsonResponse(200, {
            data: {
              chunk: { build_status: "ready", retrieval_status: "ready" },
            },
          });
        }
        if (path.includes("/build-profile")) {
          return jsonResponse(200, {
            data: {
              active_build_profile_id: "bp-1",
              resolved_profile: { id: "bp-1", name: "Default" },
            },
          });
        }
        if (path.endsWith("/builds") && init?.method === "POST") {
          return jsonResponse(200, {
            data: {
              jobs: [
                {
                  id: "build-1",
                  status: "queued",
                  progress: 0,
                  knowledge_base_id: "kb_1",
                },
              ],
            },
          });
        }
        if (path.includes("/builds/") && path.endsWith("/retry")) {
          return jsonResponse(200, {
            data: { id: "build-1", status: "queued", progress: 0 },
          });
        }
        if (path.includes("/builds/")) {
          return jsonResponse(200, {
            data: { id: "build-1", status: "running", progress: 40 },
          });
        }
        if (init?.method === "DELETE") {
          return jsonResponse(200, { data: null });
        }
        return jsonResponse(200, {
          data: {
            id: "sf-1",
            knowledge_base_id: "kb_1",
            file_name: "notes.pdf",
            status: "active",
            active_version_id: "ver-1",
          },
        });
      }),
    );

    await expect(provider.getFile({ sourceFileId: "sf-1" })).resolves.toMatchObject({
      id: "sf-1",
      activeVersionId: "ver-1",
    });
    await expect(provider.listFileVersions({ sourceFileId: "sf-1" })).resolves.toEqual([
      expect.objectContaining({ id: "ver-1", versionNo: 1 }),
    ]);
    await expect(
      provider.activateFileVersion({ sourceFileId: "sf-1", versionId: "ver-2" }),
    ).resolves.toMatchObject({ activeVersionId: "ver-2" });
    await provider.archiveFile({ sourceFileId: "sf-1" });
    await provider.unarchiveFile({ sourceFileId: "sf-1" });
    await provider.reparseFile({ sourceFileId: "sf-1" });
    await provider.deleteFile({ sourceFileId: "sf-1" });
    await expect(provider.listIndexes({ knowledgeBaseId: "kb_1" })).resolves.toEqual([
      { indexType: "chunk", buildStatus: "ready", retrievalStatus: "ready" },
    ]);
    await expect(provider.getBuildProfile({ knowledgeBaseId: "kb_1" })).resolves.toMatchObject({
      profileId: "bp-1",
      profileName: "Default",
    });
    await expect(
      provider.startBuild({ knowledgeBaseId: "kb_1", indexTypes: ["chunk"] }),
    ).resolves.toMatchObject({ id: "build-1", status: "queued" });
    await expect(provider.getBuild({ buildId: "build-1" })).resolves.toMatchObject({
      status: "running",
      progress: 40,
    });
    await provider.retryBuild({ buildId: "build-1" });

    expect(seen).toContain("GET /api/v1/source-files/sf-1");
    expect(seen).toContain("POST /api/v1/source-files/sf-1/versions/ver-2/activate");
    expect(seen).toContain("GET /api/v2/knowledge-bases/kb_1/indexes");
    expect(seen).toContain("POST /api/v2/knowledge-bases/kb_1/builds");
    expect(seen).toContain("GET /api/v2/builds/build-1");
  });
});
