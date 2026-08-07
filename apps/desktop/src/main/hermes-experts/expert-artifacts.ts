import { readFileSync } from "fs";
import type { HermesExpertArtifact } from "../../shared/hermes-experts/hermes-experts-contract";
import { insertArtifact, listArtifactsForRun } from "./expert-runtime-db";

export function listRunArtifacts(runId: string): HermesExpertArtifact[] {
  return listArtifactsForRun(runId);
}

export function createTextArtifact(input: Omit<HermesExpertArtifact, "id" | "createdAt">): HermesExpertArtifact {
  return insertArtifact(input);
}

export function readArtifactPreview(filePath: string, maxBytes = 32_768): string {
  try {
    const buf = readFileSync(filePath);
    return buf.subarray(0, maxBytes).toString("utf-8");
  } catch {
    return "";
  }
}
