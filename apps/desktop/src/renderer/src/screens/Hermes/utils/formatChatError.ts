/** Strip IPC wrapper and surface a short user-facing chat error. */
export function formatChatError(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^Error invoking remote method '[^']+':\s*/i, "");
  s = s.replace(/^Error:\s*/i, "");

  const codeMatch = s.match(/Error code:\s*(\d+)\s*-\s*(.+)/i);
  if (codeMatch) {
    const tail = codeMatch[2];
    const msg =
      tail.match(/'message':\s*'([^']+)'/)?.[1] ??
      tail.match(/"message":\s*"([^"]+)"/)?.[1];
    if (msg) return `${codeMatch[1]}: ${msg}`;
    if (tail.length > 180) return `${codeMatch[1]}: ${tail.slice(0, 180)}…`;
    return `${codeMatch[1]}: ${tail}`;
  }

  if (s.length > 240) return `${s.slice(0, 240)}…`;
  return s;
}
