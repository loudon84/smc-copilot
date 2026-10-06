import type { ManagedFile } from "../../shared/files";
import { streamSkillRunArtifactBytes } from "./skill-run-artifact-transfer";
import { streamRemoteExpertAcpArtifactBytes } from "../remote-expert/remote-artifact-client";
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
      agentRef: input.file.remoteTaskId ?? "",
      artifactId: input.file.remoteArtifactId!,
      runId: input.file.remoteRunId ?? "",
      expectedSha256: input.file.contentHash,
      profile: input.profileArg,
      destinationPath: input.destinationPath,
      maxBytes: input.maxBytes,
      signal: input.signal,
    });
  }
  throw FilePlatformError.fromCode(
    "FILE_REMOTE_UNAVAILABLE",
    `unsupported remote provider: ${provider}`,
  );
}
