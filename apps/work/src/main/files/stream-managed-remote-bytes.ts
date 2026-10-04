import type { ManagedFile } from "../../shared/files";
import { streamExpertArtifactBytes } from "./expert-artifact-transfer";
import { streamSkillRunArtifactBytes } from "./skill-run-artifact-transfer";
import { streamRemoteExpertAcpArtifactBytes } from "../remote-expert-acp/remote-artifact-bridge";
import { FilePlatformError } from "./file-security";

export async function streamManagedRemoteBytes(input: {
  file: ManagedFile;
  profileArg?: string;
  destinationPath?: string;
  maxBytes?: number;
  signal?: AbortSignal;
}): Promise<{ path: string; hash: string; size: number }> {
  const provider = input.file.provider ?? "expert";
  if (provider === "skill-run") {
    return streamSkillRunArtifactBytes({
      artifactId: input.file.remoteArtifactId!,
      runId: input.file.remoteRunId,
      expectedSha256: input.file.contentHash,
      profile: input.profileArg,
      destinationPath: input.destinationPath,
      maxBytes: input.maxBytes,
      signal: input.signal,
    });
  }
  if (provider === "remote-expert-acp") {
    return streamRemoteExpertAcpArtifactBytes({
      artifactId: input.file.remoteArtifactId!,
      runId: input.file.remoteRunId ?? "",
      expectedSha256: input.file.contentHash,
      profile: input.profileArg,
      destinationPath: input.destinationPath,
      maxBytes: input.maxBytes,
      signal: input.signal,
    });
  }
  if (provider === "expert") {
    return streamExpertArtifactBytes({
      artifactId: input.file.remoteArtifactId!,
      expectedSha256: input.file.contentHash,
      profile: input.profileArg,
      destinationPath: input.destinationPath,
      maxBytes: input.maxBytes,
    });
  }
  const _never: never = provider;
  throw FilePlatformError.fromCode(
    "FILE_NOT_FOUND",
    `unsupported remote provider: ${String(_never)}`,
  );
}
