import { createHash } from "crypto";
import type { RemoteExpertProfileDraft } from "../../shared/remote-expert-acp/contract";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";

function canonicalizeRefs(refs: unknown): string[] {
  if (!Array.isArray(refs)) {
    throw new RemoteExpertError("REMOTE_PROFILE_INVALID", "refs must be an array");
  }
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const item of refs) {
    if (typeof item !== "string") {
      throw new RemoteExpertError("REMOTE_PROFILE_INVALID", "ref must be a string");
    }
    const trimmed = item.trim();
    if (!trimmed) {
      throw new RemoteExpertError("REMOTE_PROFILE_INVALID", "ref must be non-empty");
    }
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed);
  }
  cleaned.sort((a, b) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  return cleaned;
}

export function canonicalizeRemoteExpertProfile(input: {
  name: string;
  agent_ref: string;
  knowledge_refs?: string[];
  connector_binding_refs?: string[];
  integration_account_refs?: string[];
}): RemoteExpertProfileDraft {
  const name = input.name?.trim() ?? "";
  const agent_ref = input.agent_ref?.trim() ?? "";
  if (!name || !agent_ref) {
    throw new RemoteExpertError("REMOTE_PROFILE_INVALID", "name and agent_ref required");
  }
  return {
    profile_version: 1,
    name,
    agent_ref,
    knowledge_refs: canonicalizeRefs(input.knowledge_refs ?? []),
    connector_binding_refs: canonicalizeRefs(input.connector_binding_refs ?? []),
    integration_account_refs: canonicalizeRefs(input.integration_account_refs ?? []),
  };
}

export function canonicalProfileJson(profile: RemoteExpertProfileDraft): string {
  return JSON.stringify({
    profile_version: 1,
    name: profile.name,
    agent_ref: profile.agent_ref,
    knowledge_refs: profile.knowledge_refs,
    connector_binding_refs: profile.connector_binding_refs,
    integration_account_refs: profile.integration_account_refs,
  });
}

export function profileDigest(profile: RemoteExpertProfileDraft): string {
  return createHash("sha256").update(canonicalProfileJson(profile), "utf8").digest("hex");
}
