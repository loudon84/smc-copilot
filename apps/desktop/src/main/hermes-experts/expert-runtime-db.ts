import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import { HERMES_HOME } from "../installer";
import { EXPERT_CATALOG_CACHE_VERSION } from "./expert-mcp-endpoint";
import type {
  ExpertRunEvent,
  HermesExpert,
  HermesExpertArtifact,
  HermesExpertRun,
  HermesExpertTeam,
} from "../../shared/hermes-experts/hermes-experts-contract";

const DB_DIR = join(HERMES_HOME, "desktop");
const DB_PATH = join(DB_DIR, "expert-runtime.db");

let dbInstance: Database.Database | null = null;

function now(): string {
  return new Date().toISOString();
}

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
  dbInstance = new Database(DB_PATH);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("busy_timeout = 5000");
  dbInstance.pragma("foreign_keys = ON");
  migrate(dbInstance);
  return dbInstance;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expert_catalog_cache (
      expert_id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      category TEXT,
      version TEXT,
      source TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expert_instances (
      id TEXT PRIMARY KEY,
      expert_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      profile_home TEXT NOT NULL,
      status TEXT NOT NULL,
      trust_status TEXT NOT NULL DEFAULT 'untrusted',
      installed_version TEXT,
      gateway_port INTEGER,
      installed_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS expert_team_catalog_cache (
      team_id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      category TEXT,
      version TEXT,
      manifest_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expert_team_instances (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      leader_profile_id TEXT NOT NULL,
      status TEXT NOT NULL,
      installed_version TEXT,
      installed_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS expert_team_members (
      id TEXT PRIMARY KEY,
      team_instance_id TEXT NOT NULL,
      expert_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      role_name TEXT NOT NULL,
      responsibility TEXT,
      is_leader INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS expert_runs (
      id TEXT PRIMARY KEY,
      run_type TEXT NOT NULL,
      expert_id TEXT,
      team_id TEXT,
      session_id TEXT,
      profile_id TEXT,
      status TEXT NOT NULL,
      title TEXT,
      user_prompt TEXT,
      result_summary TEXT,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT,
      updated_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS expert_run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      source_profile_id TEXT,
      target_profile_id TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expert_artifacts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      profile_id TEXT,
      title TEXT NOT NULL,
      artifact_type TEXT NOT NULL,
      file_path TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      preview_text TEXT,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expert_install_events (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expert_catalog_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const row = db.prepare("SELECT MAX(version) as v FROM schema_version").get() as { v: number | null };
  const currentVersion = row?.v ?? 0;
  if (currentVersion < 1) {
    db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)").run(1, now());
  }
  if (currentVersion < 2) {
    const cols = db.prepare("PRAGMA table_info(expert_runs)").all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "remote_task_id")) {
      db.exec("ALTER TABLE expert_runs ADD COLUMN remote_task_id TEXT");
    }
    db.prepare("INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)").run(2, now());
  }
  if (currentVersion < 3) {
    const cols = db.prepare("PRAGMA table_info(expert_runs)").all() as Array<{ name: string }>;
    const addCol = (name: string, ddl: string) => {
      if (!cols.some((c) => c.name === name)) db.exec(ddl);
    };
    addCol("catalog_slug", "ALTER TABLE expert_runs ADD COLUMN catalog_slug TEXT");
    addCol("catalog_kind", "ALTER TABLE expert_runs ADD COLUMN catalog_kind TEXT");
    addCol("skill_name", "ALTER TABLE expert_runs ADD COLUMN skill_name TEXT");
    addCol("structured_content_json", "ALTER TABLE expert_runs ADD COLUMN structured_content_json TEXT");
    addCol("invocation_id", "ALTER TABLE expert_runs ADD COLUMN invocation_id TEXT");
    addCol("execution_mode", "ALTER TABLE expert_runs ADD COLUMN execution_mode TEXT DEFAULT 'remote_mcp'");
    db.prepare("INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)").run(3, now());
  }
  if (currentVersion < 4) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS expert_catalog_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    db.prepare("INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)").run(4, now());
  }
}

export function initExpertRuntimeDb(): void {
  getDb();
}

export function cacheExpertCatalog(experts: HermesExpert[], source: string): void {
  replaceExpertCatalogCache(experts, source);
}

export function replaceExpertCatalogCache(experts: HermesExpert[], source: string): void {
  const db = getDb();
  db.prepare("DELETE FROM expert_catalog_cache").run();
  setExpertCatalogMeta("cache_version", EXPERT_CATALOG_CACHE_VERSION);
  setExpertCatalogMeta("last_source", source);
  if (experts.length === 0) return;
  const stmt = db.prepare(`
    INSERT INTO expert_catalog_cache (expert_id, slug, name, display_name, category, version, source, manifest_json, synced_at)
    VALUES (@expert_id, @slug, @name, @display_name, @category, @version, @source, @manifest_json, @synced_at)
  `);
  const syncedAt = now();
  for (const e of experts) {
    stmt.run({
      expert_id: e.expertId,
      slug: e.slug,
      name: e.name,
      display_name: e.displayName,
      category: e.category,
      version: e.version,
      source,
      manifest_json: JSON.stringify(e),
      synced_at: syncedAt,
    });
  }
}

export function replaceExpertTeamCatalogCache(teams: HermesExpertTeam[], source: string): void {
  const db = getDb();
  db.prepare("DELETE FROM expert_team_catalog_cache").run();
  setExpertCatalogMeta("team_cache_version", EXPERT_CATALOG_CACHE_VERSION);
  setExpertCatalogMeta("last_team_source", source);
  if (teams.length === 0) return;
  const stmt = db.prepare(`
    INSERT INTO expert_team_catalog_cache (team_id, slug, name, display_name, category, version, manifest_json, synced_at)
    VALUES (@team_id, @slug, @name, @display_name, @category, @version, @manifest_json, @synced_at)
  `);
  const syncedAt = now();
  for (const t of teams) {
    stmt.run({
      team_id: t.teamId,
      slug: t.slug,
      name: t.name,
      display_name: t.displayName,
      category: t.category,
      version: t.version,
      manifest_json: JSON.stringify(t),
      synced_at: syncedAt,
    });
  }
}

export function clearExpertCatalogCaches(): void {
  const db = getDb();
  db.prepare("DELETE FROM expert_catalog_cache").run();
  db.prepare("DELETE FROM expert_team_catalog_cache").run();
  setExpertCatalogMeta("cache_version", EXPERT_CATALOG_CACHE_VERSION);
  setExpertCatalogMeta("last_source", "cleared");
  setExpertCatalogMeta("last_team_source", "cleared");
}

function setExpertCatalogMeta(key: string, value: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO expert_catalog_meta (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `).run(key, value, now());
}

export function getExpertCatalogMeta(key: string): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM expert_catalog_meta WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function isValidRemoteExpertCacheEntry(expert: HermesExpert): boolean {
  const cacheVersion = getExpertCatalogMeta("cache_version");
  if (cacheVersion && cacheVersion !== EXPERT_CATALOG_CACHE_VERSION) return false;
  return (
    expert.catalogKind === "expert" &&
    (expert.executionMode === "remote_mcp" || expert.profile?.profileId === "remote")
  );
}

export function isValidRemoteTeamCacheEntry(team: HermesExpertTeam): boolean {
  const cacheVersion = getExpertCatalogMeta("team_cache_version");
  if (cacheVersion && cacheVersion !== EXPERT_CATALOG_CACHE_VERSION) return false;
  return team.catalogKind === "expert_team" && team.executionMode === "remote_mcp";
}

export function cacheExpertTeamCatalog(teams: HermesExpertTeam[], source = "remote"): void {
  replaceExpertTeamCatalogCache(teams, source);
}

export function listCachedExperts(): HermesExpert[] {
  const db = getDb();
  const rows = db.prepare("SELECT manifest_json FROM expert_catalog_cache ORDER BY display_name").all() as Array<{
    manifest_json: string;
  }>;
  return rows
    .map((r) => JSON.parse(r.manifest_json) as HermesExpert)
    .filter(isValidRemoteExpertCacheEntry);
}

export function listCachedTeams(): HermesExpertTeam[] {
  const db = getDb();
  const rows = db.prepare("SELECT manifest_json FROM expert_team_catalog_cache ORDER BY display_name").all() as Array<{
    manifest_json: string;
  }>;
  return rows
    .map((r) => JSON.parse(r.manifest_json) as HermesExpertTeam)
    .filter(isValidRemoteTeamCacheEntry);
}

export function getCachedExpert(expertId: string): HermesExpert | null {
  const db = getDb();
  const row = db
    .prepare("SELECT manifest_json FROM expert_catalog_cache WHERE expert_id = ?")
    .get(expertId) as { manifest_json: string } | undefined;
  return row ? (JSON.parse(row.manifest_json) as HermesExpert) : null;
}

export function getCachedTeam(teamId: string): HermesExpertTeam | null {
  const db = getDb();
  const row = db
    .prepare("SELECT manifest_json FROM expert_team_catalog_cache WHERE team_id = ?")
    .get(teamId) as { manifest_json: string } | undefined;
  return row ? (JSON.parse(row.manifest_json) as HermesExpertTeam) : null;
}

export function upsertExpertInstance(input: {
  expertId: string;
  profileId: string;
  profileHome: string;
  status: string;
  trustStatus?: string;
  installedVersion?: string;
  gatewayPort?: number;
}): void {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM expert_instances WHERE expert_id = ?")
    .get(input.expertId) as { id: string } | undefined;
  const ts = now();
  if (existing) {
    db.prepare(`
      UPDATE expert_instances SET profile_id=?, profile_home=?, status=?, trust_status=?, installed_version=?, gateway_port=?, updated_at=?
      WHERE expert_id=?
    `).run(
      input.profileId,
      input.profileHome,
      input.status,
      input.trustStatus ?? "untrusted",
      input.installedVersion ?? null,
      input.gatewayPort ?? null,
      ts,
      input.expertId,
    );
  } else {
    db.prepare(`
      INSERT INTO expert_instances (id, expert_id, profile_id, profile_home, status, trust_status, installed_version, gateway_port, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.expertId,
      input.profileId,
      input.profileHome,
      input.status,
      input.trustStatus ?? "untrusted",
      input.installedVersion ?? null,
      input.gatewayPort ?? null,
      ts,
      ts,
    );
  }
}

export function getExpertInstance(expertId: string): {
  expertId: string;
  profileId: string;
  profileHome: string;
  status: string;
  trustStatus: string;
  gatewayPort?: number;
} | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT expert_id, profile_id, profile_home, status, trust_status, gateway_port FROM expert_instances WHERE expert_id = ?",
    )
    .get(expertId) as
    | {
        expert_id: string;
        profile_id: string;
        profile_home: string;
        status: string;
        trust_status: string;
        gateway_port: number | null;
      }
    | undefined;
  if (!row) return null;
  return {
    expertId: row.expert_id,
    profileId: row.profile_id,
    profileHome: row.profile_home,
    status: row.status,
    trustStatus: row.trust_status,
    gatewayPort: row.gateway_port ?? undefined,
  };
}

export function getExpertInstanceByProfileId(profileId: string): {
  expertId: string;
  profileId: string;
  profileHome: string;
  status: string;
  trustStatus: string;
  gatewayPort?: number;
} | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT expert_id, profile_id, profile_home, status, trust_status, gateway_port FROM expert_instances WHERE profile_id = ?",
    )
    .get(profileId) as
    | {
        expert_id: string;
        profile_id: string;
        profile_home: string;
        status: string;
        trust_status: string;
        gateway_port: number | null;
      }
    | undefined;
  if (!row) return null;
  return {
    expertId: row.expert_id,
    profileId: row.profile_id,
    profileHome: row.profile_home,
    status: row.status,
    trustStatus: row.trust_status,
    gatewayPort: row.gateway_port ?? undefined,
  };
}

export function upsertExpertTeamInstance(input: {
  teamId: string;
  leaderProfileId: string;
  installedVersion?: string;
  members: Array<{
    expertId: string;
    profileId: string;
    roleName: string;
    responsibility?: string;
    isLeader?: boolean;
    sortOrder?: number;
  }>;
}): void {
  const db = getDb();
  const ts = now();
  const existing = db
    .prepare("SELECT id FROM expert_team_instances WHERE team_id = ?")
    .get(input.teamId) as { id: string } | undefined;
  const instanceId = existing?.id ?? randomUUID();

  if (existing) {
    db.prepare(`
      UPDATE expert_team_instances SET leader_profile_id=?, status=?, installed_version=?, updated_at=?
      WHERE team_id=?
    `).run(input.leaderProfileId, "installed", input.installedVersion ?? null, ts, input.teamId);
    db.prepare("DELETE FROM expert_team_members WHERE team_instance_id = ?").run(instanceId);
  } else {
    db.prepare(`
      INSERT INTO expert_team_instances (id, team_id, leader_profile_id, status, installed_version, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      instanceId,
      input.teamId,
      input.leaderProfileId,
      "installed",
      input.installedVersion ?? null,
      ts,
      ts,
    );
  }

  for (const member of input.members) {
    db.prepare(`
      INSERT INTO expert_team_members (id, team_instance_id, expert_id, profile_id, role_name, responsibility, is_leader, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      instanceId,
      member.expertId,
      member.profileId,
      member.roleName,
      member.responsibility ?? null,
      member.isLeader ? 1 : 0,
      member.sortOrder ?? 0,
    );
  }
}

export function setExpertTrust(expertId: string, trustStatus: string): void {
  const db = getDb();
  db.prepare("UPDATE expert_instances SET trust_status = ?, updated_at = ? WHERE expert_id = ?").run(
    trustStatus,
    now(),
    expertId,
  );
}

export function insertInstallEvent(input: {
  targetType: string;
  targetId: string;
  action: string;
  status: string;
  payload?: unknown;
  errorMessage?: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO expert_install_events (id, target_type, target_id, action, status, payload_json, error_message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    input.targetType,
    input.targetId,
    input.action,
    input.status,
    input.payload ? JSON.stringify(input.payload) : null,
    input.errorMessage ?? null,
    now(),
  );
}

export function createExpertRun(input: {
  runType: string;
  expertId?: string;
  teamId?: string;
  profileId: string;
  sessionId?: string;
  title: string;
  userPrompt: string;
  status: string;
  remoteTaskId?: string;
  catalogSlug?: string;
  catalogKind?: string;
  skillName?: string;
  executionMode?: string;
}): HermesExpertRun {
  const db = getDb();
  const runId = randomUUID();
  const ts = now();
  db.prepare(`
    INSERT INTO expert_runs (
      id, run_type, expert_id, team_id, session_id, profile_id, status, title, user_prompt,
      remote_task_id, catalog_slug, catalog_kind, skill_name, execution_mode, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId,
    input.runType,
    input.expertId ?? null,
    input.teamId ?? null,
    input.sessionId ?? null,
    input.profileId,
    input.status,
    input.title,
    input.userPrompt,
    input.remoteTaskId ?? null,
    input.catalogSlug ?? null,
    input.catalogKind ?? null,
    input.skillName ?? null,
    input.executionMode ?? "remote_mcp",
    ts,
    ts,
  );
  return {
    runId,
    runType: input.runType as HermesExpertRun["runType"],
    expertId: input.expertId,
    teamId: input.teamId,
    remoteTaskId: input.remoteTaskId,
    activeProfileId: input.profileId,
    sessionId: input.sessionId,
    title: input.title,
    userPrompt: input.userPrompt,
    catalogSlug: input.catalogSlug,
    catalogKind: input.catalogKind as HermesExpertRun["catalogKind"],
    skillName: input.skillName,
    executionMode: (input.executionMode ?? "remote_mcp") as HermesExpertRun["executionMode"],
    status: input.status as HermesExpertRun["status"],
    startedAt: ts,
  };
}

export function setExpertRunRemoteTaskId(runId: string, remoteTaskId: string): void {
  const db = getDb();
  db.prepare("UPDATE expert_runs SET remote_task_id = ?, updated_at = ? WHERE id = ?").run(
    remoteTaskId,
    now(),
    runId,
  );
}

export function updateExpertRunStatus(
  runId: string,
  status: string,
  opts?: {
    resultSummary?: string;
    errorCode?: string;
    errorMessage?: string;
    structuredContentJson?: string;
    invocationId?: string;
  },
): void {
  const db = getDb();
  const completed =
    status === "completed" || status === "failed" || status === "cancelled" ? now() : null;
  db.prepare(`
    UPDATE expert_runs SET
      status=?,
      result_summary=?,
      error_code=?,
      error_message=?,
      structured_content_json=COALESCE(?, structured_content_json),
      invocation_id=COALESCE(?, invocation_id),
      updated_at=?,
      completed_at=COALESCE(?, completed_at)
    WHERE id=?
  `).run(
    status,
    opts?.resultSummary ?? null,
    opts?.errorCode ?? null,
    opts?.errorMessage ?? null,
    opts?.structuredContentJson ?? null,
    opts?.invocationId ?? null,
    now(),
    completed,
    runId,
  );
}

function mapRunRow(row: Record<string, unknown>): HermesExpertRun {
  const resultSummary = row.result_summary ? String(row.result_summary) : undefined;
  return {
    runId: String(row.id),
    runType: row.run_type as HermesExpertRun["runType"],
    expertId: row.expert_id ? String(row.expert_id) : undefined,
    teamId: row.team_id ? String(row.team_id) : undefined,
    remoteTaskId: row.remote_task_id ? String(row.remote_task_id) : undefined,
    activeProfileId: String(row.profile_id),
    sessionId: row.session_id ? String(row.session_id) : undefined,
    title: String(row.title ?? ""),
    userPrompt: String(row.user_prompt ?? ""),
    responseText: resultSummary,
    catalogSlug: row.catalog_slug ? String(row.catalog_slug) : undefined,
    catalogKind: row.catalog_kind ? (String(row.catalog_kind) as HermesExpertRun["catalogKind"]) : undefined,
    skillName: row.skill_name ? String(row.skill_name) : undefined,
    structuredContentJson: row.structured_content_json
      ? String(row.structured_content_json)
      : undefined,
    invocationId: row.invocation_id ? String(row.invocation_id) : undefined,
    executionMode: row.execution_mode
      ? (String(row.execution_mode) as HermesExpertRun["executionMode"])
      : undefined,
    status: row.status as HermesExpertRun["status"],
    startedAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    error:
      row.error_code || row.error_message
        ? { code: String(row.error_code ?? ""), message: String(row.error_message ?? "") }
        : undefined,
  };
}

export function listExpertRuns(filter?: { status?: string; limit?: number }): HermesExpertRun[] {
  const db = getDb();
  const limit = filter?.limit ?? 50;
  if (filter?.status && filter.status !== "all") {
    const rows = db
      .prepare(`SELECT * FROM expert_runs WHERE status = ? ORDER BY created_at DESC LIMIT ${limit}`)
      .all(filter.status) as Record<string, unknown>[];
    return rows.map(mapRunRow);
  }
  const rows = db
    .prepare(`SELECT * FROM expert_runs ORDER BY created_at DESC LIMIT ${limit}`)
    .all() as Record<string, unknown>[];
  return rows.map(mapRunRow);
}

export function getExpertRun(runId: string): HermesExpertRun | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM expert_runs WHERE id = ?").get(runId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  const run = mapRunRow(row);
  run.artifacts = listArtifactsForRun(runId);
  run.memberRuns = listMemberRunsForRun(runId);
  run.events = listRunEvents(runId);
  return run;
}

function listMemberRunsForRun(runId: string): HermesExpertRun["memberRuns"] {
  const events = listRunEvents(runId);
  return events
    .filter((e) => e.eventType === "member_completed" || e.eventType === "member_failed")
    .map((e) => ({
      memberProfileId: e.targetProfileId ?? e.sourceProfileId ?? "",
      roleName: String(e.payload?.roleName ?? ""),
      status: e.eventType === "member_completed" ? ("succeeded" as const) : ("failed" as const),
      summary: typeof e.payload?.summary === "string" ? e.payload.summary : undefined,
      error:
        e.eventType === "member_failed"
          ? {
              code: String(e.payload?.code ?? "MEMBER_FAILED"),
              message: String(e.payload?.message ?? ""),
            }
          : undefined,
    }));
}

export function insertRunEvent(input: Omit<ExpertRunEvent, "id" | "createdAt">): ExpertRunEvent {
  const db = getDb();
  const event: ExpertRunEvent = {
    id: randomUUID(),
    ...input,
    createdAt: now(),
  };
  db.prepare(`
    INSERT INTO expert_run_events (id, run_id, event_type, source_profile_id, target_profile_id, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.runId,
    event.eventType,
    event.sourceProfileId ?? null,
    event.targetProfileId ?? null,
    event.payload ? JSON.stringify(event.payload) : null,
    event.createdAt,
  );
  return event;
}

export function listRunEvents(runId: string): ExpertRunEvent[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM expert_run_events WHERE run_id = ? ORDER BY created_at ASC")
    .all(runId) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    runId: String(row.run_id),
    eventType: String(row.event_type),
    sourceProfileId: row.source_profile_id ? String(row.source_profile_id) : undefined,
    targetProfileId: row.target_profile_id ? String(row.target_profile_id) : undefined,
    payload: row.payload_json ? (JSON.parse(String(row.payload_json)) as Record<string, unknown>) : undefined,
    createdAt: String(row.created_at),
  }));
}

export function insertArtifact(input: Omit<HermesExpertArtifact, "id" | "createdAt">): HermesExpertArtifact {
  const db = getDb();
  const artifact: HermesExpertArtifact = {
    id: randomUUID(),
    ...input,
    createdAt: now(),
  };
  db.prepare(`
    INSERT INTO expert_artifacts (id, run_id, profile_id, title, artifact_type, file_path, mime_type, size_bytes, preview_text, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    artifact.id,
    artifact.runId,
    artifact.profileId ?? null,
    artifact.title,
    artifact.artifactType,
    artifact.filePath ?? null,
    artifact.mimeType ?? null,
    artifact.sizeBytes ?? null,
    artifact.previewText ?? null,
    artifact.source,
    artifact.createdAt,
  );
  return artifact;
}

export function listArtifactsForRun(runId: string): HermesExpertArtifact[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM expert_artifacts WHERE run_id = ? ORDER BY created_at ASC")
    .all(runId) as Array<Record<string, unknown>>;
  return rows.map(mapArtifactRow);
}

function mapArtifactRow(row: Record<string, unknown>): HermesExpertArtifact {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    profileId: row.profile_id ? String(row.profile_id) : undefined,
    title: String(row.title),
    artifactType: row.artifact_type as HermesExpertArtifact["artifactType"],
    filePath: row.file_path ? String(row.file_path) : undefined,
    mimeType: row.mime_type ? String(row.mime_type) : undefined,
    sizeBytes: row.size_bytes != null ? Number(row.size_bytes) : undefined,
    previewText: row.preview_text ? String(row.preview_text) : undefined,
    source: String(row.source),
    createdAt: String(row.created_at),
  };
}

export function getArtifactById(artifactId: string): HermesExpertArtifact | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM expert_artifacts WHERE id = ?").get(artifactId) as
    | Record<string, unknown>
    | undefined;
  return row ? mapArtifactRow(row) : null;
}

export function listAllArtifacts(limit = 100): HermesExpertArtifact[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM expert_artifacts ORDER BY created_at DESC LIMIT ${limit}`)
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapArtifactRow);
}
