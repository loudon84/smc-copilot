const STORAGE_KEY = "hermes-last-login-email";

export function readLastLoginEmail(): string {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function saveLastLoginEmail(email: string): void {
  const trimmed = email.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(STORAGE_KEY, trimmed);
  } catch {
    /* quota / private mode */
  }
}
