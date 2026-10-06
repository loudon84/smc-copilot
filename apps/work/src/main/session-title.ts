/**
 * Hermes state.db enforces UNIQUE(sessions.title). Keep an existing title for
 * this session id; otherwise disambiguate collisions.
 */
export function resolveUniqueSessionTitle(
  db: {
    // Structural type must accept better-sqlite3 Statement.get bindings.
    prepare: (sql: string) => {
      get: (...args: any[]) => unknown;
    };
  },
  sessionId: string,
  desiredTitle: string,
): string {
  const existing = db
    .prepare(`SELECT title FROM sessions WHERE id = ? LIMIT 1`)
    .get(sessionId) as { title: string | null } | undefined;
  const kept = existing?.title?.trim();
  if (kept) return kept;

  const base = desiredTitle.trim() || "Conversation";
  const taken = db
    .prepare(`SELECT id FROM sessions WHERE title = ? AND id != ? LIMIT 1`)
    .get(base, sessionId) as { id: string } | undefined;
  if (!taken) return base;

  const suffix = sessionId.replace(/^desk-/, "").slice(-8);
  let candidate = `${base} · ${suffix}`;
  for (let n = 2; n < 20; n += 1) {
    const clash = db
      .prepare(`SELECT id FROM sessions WHERE title = ? AND id != ? LIMIT 1`)
      .get(candidate, sessionId) as { id: string } | undefined;
    if (!clash) return candidate;
    candidate = `${base} · ${suffix}-${n}`;
  }
  return `${base} · ${sessionId}`;
}
