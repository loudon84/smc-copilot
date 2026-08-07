import { resolveProfileRef } from "./workspace-chat-client";

export async function resolveWorkspaceProfile(ref: string) {
  return resolveProfileRef(ref);
}
