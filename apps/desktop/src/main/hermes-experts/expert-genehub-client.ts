import { readFileSync } from "fs";
import type {
  GeneHubPullJob,
  GeneHubSkillSubmission,
  PushSkillInput,
} from "../../shared/hermes-experts/hermes-experts-contract";
import { unwrapNodeDeskClawResponse } from "../auth/nodeskclaw-auth-response";
import { resolveBackendBaseUrl } from "../mcp-skill-gateway-runtime/mcp-skill-gateway-config";
import { getMcpAccessToken } from "../mcp-skill-gateway-runtime/mcp-token-provider";

async function genehubFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const backend = resolveBackendBaseUrl();
  if (!backend) throw new Error("Backend URL is not configured");
  const token = getMcpAccessToken();
  if (!token) throw new Error("Desktop login required");

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${backend.replace(/\/+$/, "")}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as unknown;
  return unwrapNodeDeskClawResponse<T>(json);
}

export async function pushGeneHubSkill(
  input: PushSkillInput,
): Promise<{ ok: boolean; submissionId?: string; error?: string }> {
  try {
    const body = readFileSync(input.skillPath);
    const form = new FormData();
    form.append("name", input.name);
    if (input.version) form.append("version", input.version);
    if (input.description) form.append("description", input.description);
    form.append("file", new Blob([body]), input.skillPath.split(/[/\\]/).pop() ?? "skill.zip");

    const backend = resolveBackendBaseUrl();
    const token = getMcpAccessToken();
    if (!backend || !token) return { ok: false, error: "Login required" };

    const res = await fetch(`${backend.replace(/\/+$/, "")}/api/v1/genehub/submissions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = (await res.json()) as { submission_id?: string; submissionId?: string };
    return { ok: true, submissionId: json.submission_id ?? json.submissionId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function listGeneHubSubmissions(): Promise<GeneHubSkillSubmission[]> {
  try {
    const data = await genehubFetch<{ items?: GeneHubSkillSubmission[] }>("/api/v1/genehub/submissions");
    return data.items ?? [];
  } catch {
    return [];
  }
}

export async function listGeneHubPullJobs(): Promise<GeneHubPullJob[]> {
  try {
    const data = await genehubFetch<{ items?: GeneHubPullJob[] }>("/api/v1/genehub/pull-jobs");
    return data.items ?? [];
  } catch {
    return [];
  }
}
