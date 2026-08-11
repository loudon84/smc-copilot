/**
 * Session file context actions — thin wrappers around hermesAPI.files.
 */

export async function addFileToSessionContext(input: {
  profile?: string;
  sessionId: string;
  fileId: string;
}): Promise<void> {
  await window.hermesAPI.files.addToSessionContext(input);
}

export async function removeFileFromSessionContext(input: {
  profile?: string;
  sessionId: string;
  fileId: string;
}): Promise<void> {
  await window.hermesAPI.files.removeFromSessionContext(input);
}

export async function listSessionManagedFiles(
  profile: string | undefined,
  sessionId: string,
): Promise<Awaited<ReturnType<typeof window.hermesAPI.files.listSessionFiles>>> {
  return window.hermesAPI.files.listSessionFiles(profile, sessionId);
}

export async function searchSessionManagedFiles(input: {
  profile?: string;
  sessionId: string;
  query: string;
  maxResults?: number;
}): Promise<
  Awaited<ReturnType<typeof window.hermesAPI.files.searchSessionFiles>>
> {
  return window.hermesAPI.files.searchSessionFiles(input);
}
