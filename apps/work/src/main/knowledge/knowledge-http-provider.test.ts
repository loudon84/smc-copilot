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
