import Database from "better-sqlite3";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { HERMES_HOME } from "./installer";
import type {
  ProfileRecord,
  RuntimeInstanceRecord,
  ProfileEntryRecord,
  ProfileCapabilityRecord,
  ProfileSkillRecord,
  SkillSyncEventRecord,
  SharedContextRecord,
  DelegationEventRecord,
  AuditEventRecord,
  ProfileRuntimeStatus,
  RuntimeType,
  ProfileRole,
  ShareMode,
  CapabilityName,
} from "../shared/profile-runtime/profile-runtime-contract";
import type {
  RuntimeServiceRecord,
  RuntimeEventRecord,
  RuntimeSettingRecord,
  AiOsServiceId,
  RuntimeServiceStatus,
  RuntimeEventLevel,
} from "../shared/aios/aios-contract";
import type { ProfileRoleSpecRecord } from "../shared/profile-roles/profile-role-contract";

const DB_DIR = join(HERMES_HOME, "desktop");
const DB_PATH = join(DB_DIR, "profile-runtime.db");

const CURRENT_SCHEMA_VERSION = 3;

let dbInstance: Database.Database | null = null;

function now(): string {
  return new Date().toISOString();
}

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
  }
  dbInstance = new Database(DB_PATH);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("busy_timeout = 5000");
  dbInstance.pragma("foreign_keys = ON");
  return dbInstance;
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('aios-controller', 'specialist')),
      description TEXT,
      runtime_type TEXT NOT NULL CHECK(runtime_type IN ('hermes-local', 'hermes-remote', 'tool-only', 'docker-hermes', 'browser-operator', 'feishu-bridge')),
      profile_home TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      auto_start INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runtime_instances (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      runtime_type TEXT NOT NULL,
      host TEXT NOT NULL DEFAULT '127.0.0.1',
      port INTEGER NOT NULL,
      base_url TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('not_deployed', 'stopped', 'starting', 'running', 'stopping', 'failed')),
      pid INTEGER,
      started_at TEXT,
      stopped_at TEXT,
      last_health_check_at TEXT,
      last_error TEXT,
      restart_count INTEGER NOT NULL DEFAULT 0,
      last_exit_code INTEGER,
      last_crash_at TEXT,
      auto_restart INTEGER NOT NULL DEFAULT 1,
      health_fail_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(host, port),
      FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS profile_entries (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      route TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      icon TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      config_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS profile_capabilities (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      capability_name TEXT NOT NULL CHECK(capability_name IN ('delegation', 'skill-sync', 'session-share', 'web-operator', 'gateway-supervisor')),
      enabled INTEGER NOT NULL DEFAULT 1,
      config_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(profile_id, capability_name),
      FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS profile_skills (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      skill_path TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      category TEXT,
      source_type TEXT NOT NULL,
      source_profile_id TEXT,
      filesystem_path TEXT NOT NULL,
      checksum TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      installed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(profile_id, skill_path),
      FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS skill_sync_events (
      id TEXT PRIMARY KEY,
      source_profile_id TEXT NOT NULL,
      target_profile_id TEXT NOT NULL,
      skill_path TEXT NOT NULL,
      action TEXT NOT NULL,
      overwrite INTEGER NOT NULL DEFAULT 0,
      backup_path TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shared_contexts (
      id TEXT PRIMARY KEY,
      source_profile_id TEXT NOT NULL,
      source_session_id TEXT NOT NULL,
      target_profile_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('snapshot', 'summary', 'full')),
      title TEXT,
      summary TEXT,
      context_file_path TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      max_chars INTEGER,
      checksum TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS delegation_events (
      id TEXT PRIMARY KEY,
      from_profile_id TEXT NOT NULL,
      to_profile_id TEXT NOT NULL,
      request_message TEXT NOT NULL,
      context_refs_json TEXT,
      response_summary TEXT,
      target_session_id TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      profile_id TEXT,
      source TEXT NOT NULL,
      action TEXT NOT NULL,
      payload_json TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

function createIndexes(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name);
    CREATE INDEX IF NOT EXISTS idx_profiles_enabled ON profiles(enabled);
    CREATE INDEX IF NOT EXISTS idx_profiles_auto_start ON profiles(auto_start);
    CREATE INDEX IF NOT EXISTS idx_runtime_status ON runtime_instances(status);
    CREATE INDEX IF NOT EXISTS idx_runtime_port ON runtime_instances(port);
    CREATE INDEX IF NOT EXISTS idx_profile_entries_nav ON profile_entries(profile_id, enabled);
    CREATE INDEX IF NOT EXISTS idx_capabilities_profile ON profile_capabilities(profile_id);
    CREATE INDEX IF NOT EXISTS idx_skills_profile ON profile_skills(profile_id);
    CREATE INDEX IF NOT EXISTS idx_skills_category ON profile_skills(profile_id, category);
    CREATE INDEX IF NOT EXISTS idx_skill_sync_source ON skill_sync_events(source_profile_id);
    CREATE INDEX IF NOT EXISTS idx_skill_sync_target ON skill_sync_events(target_profile_id);
    CREATE INDEX IF NOT EXISTS idx_shared_ctx_source ON shared_contexts(source_profile_id, source_session_id);
    CREATE INDEX IF NOT EXISTS idx_shared_ctx_target ON shared_contexts(target_profile_id);
    CREATE INDEX IF NOT EXISTS idx_delegation_source ON delegation_events(from_profile_id);
    CREATE INDEX IF NOT EXISTS idx_delegation_target ON delegation_events(to_profile_id);
    CREATE INDEX IF NOT EXISTS idx_audit_profile ON audit_events(profile_id);
    CREATE INDEX IF NOT EXISTS idx_audit_operation ON audit_events(event_type, action);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(created_at);
  `);
}

function createTablesV2(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_services (
      service_id TEXT PRIMARY KEY,
      service_type TEXT NOT NULL,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unknown',
      pid INTEGER,
      port INTEGER,
      url TEXT,
      install_path TEXT,
      started_at TEXT,
      stopped_at TEXT,
      last_health_at TEXT,
      last_error TEXT,
      restart_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runtime_service_events (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runtime_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function createIndexesV2(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_rt_svc_status ON runtime_services(status);
    CREATE INDEX IF NOT EXISTS idx_rt_svc_events_svc ON runtime_service_events(service_id);
    CREATE INDEX IF NOT EXISTS idx_rt_svc_events_ts ON runtime_service_events(created_at);
  `);
}

function createTablesV3(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile_role_specs (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      role_key TEXT NOT NULL,
      role_name TEXT NOT NULL,
      role_source_repo TEXT NOT NULL,
      role_source_paths_json TEXT NOT NULL,
      role_summary TEXT,
      role_manifest_path TEXT NOT NULL,
      soul_path TEXT NOT NULL,
      memory_path TEXT,
      source_checksum TEXT NOT NULL,
      installed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
      UNIQUE(profile_id, role_key)
    );
  `);
}

function createIndexesV3(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_profile_role_specs_profile ON profile_role_specs(profile_id);
    CREATE INDEX IF NOT EXISTS idx_profile_role_specs_key ON profile_role_specs(role_key);
  `);
}

export function initProfileRuntimeDb(): Database.Database {
  const db = getDb();

  // Ensure schema_version table exists for first-time init
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const currentVersion = db
    .prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")
    .get() as { version: number } | undefined;
  const ver = currentVersion?.version ?? 0;

  if (ver < CURRENT_SCHEMA_VERSION) {
    const migrate = db.transaction(() => {
      if (ver < 1) {
        createTables(db);
        createIndexes(db);
      }
      if (ver < 2) {
        createTablesV2(db);
        createIndexesV2(db);
      }
      if (ver < 3) {
        createTablesV3(db);
        createIndexesV3(db);
      }
      db.prepare(
        "INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)",
      ).run(CURRENT_SCHEMA_VERSION, now());
    });
    migrate();
  }

  return db;
}

export function closeProfileRuntimeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  return db.transaction(fn)();
}

// --- Profile CRUD ---

export function insertProfile(record: Omit<ProfileRecord, "created_at" | "updated_at">): ProfileRecord {
  const db = getDb();
  const ts = now();
  db.prepare(
    `INSERT INTO profiles (id, name, display_name, role, description, runtime_type, profile_home, enabled, auto_start, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id, record.name, record.display_name, record.role, record.description,
    record.runtime_type, record.profile_home, record.enabled ? 1 : 0, record.auto_start ? 1 : 0,
    record.sort_order, ts, ts,
  );
  return { ...record, created_at: ts, updated_at: ts };
}

export function getProfile(id: string): ProfileRecord | null {
  const db = getDb();
  return db.prepare("SELECT * FROM profiles WHERE id = ?").get(id) as ProfileRecord | null;
}

export function getProfileByName(name: string): ProfileRecord | null {
  const db = getDb();
  return db.prepare("SELECT * FROM profiles WHERE name = ?").get(name) as ProfileRecord | null;
}

export function listProfiles(): ProfileRecord[] {
  const db = getDb();
  return db.prepare("SELECT * FROM profiles ORDER BY sort_order ASC").all() as ProfileRecord[];
}

export function deleteProfile(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM profiles WHERE id = ?").run(id);
  return result.changes > 0;
}

/** Deletes profile and all FK-cascaded rows (runtime, entries, role specs, etc.). */
export function deleteProfileCascade(id: string): boolean {
  return deleteProfile(id);
}

// --- Profile Role Spec CRUD ---

export function insertProfileRoleSpec(
  record: Omit<ProfileRoleSpecRecord, "installed_at" | "updated_at">,
): ProfileRoleSpecRecord {
  const db = getDb();
  const ts = now();
  db.prepare(
    `INSERT INTO profile_role_specs (
      id, profile_id, role_key, role_name, role_source_repo, role_source_paths_json,
      role_summary, role_manifest_path, soul_path, memory_path, source_checksum,
      installed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id,
    record.profile_id,
    record.role_key,
    record.role_name,
    record.role_source_repo,
    record.role_source_paths_json,
    record.role_summary,
    record.role_manifest_path,
    record.soul_path,
    record.memory_path,
    record.source_checksum,
    ts,
    ts,
  );
  return { ...record, installed_at: ts, updated_at: ts };
}

export function updateProfileRoleSpec(
  id: string,
  patch: Partial<
    Pick<
      ProfileRoleSpecRecord,
      | "role_name"
      | "role_source_paths_json"
      | "role_summary"
      | "role_manifest_path"
      | "soul_path"
      | "memory_path"
      | "source_checksum"
    >
  >,
): void {
  const db = getDb();
  const current = getProfileRoleSpecById(id);
  if (!current) return;
  const ts = now();
  db.prepare(
    `UPDATE profile_role_specs SET
      role_name = ?,
      role_source_paths_json = ?,
      role_summary = ?,
      role_manifest_path = ?,
      soul_path = ?,
      memory_path = ?,
      source_checksum = ?,
      updated_at = ?
    WHERE id = ?`,
  ).run(
    patch.role_name ?? current.role_name,
    patch.role_source_paths_json ?? current.role_source_paths_json,
    patch.role_summary !== undefined ? patch.role_summary : current.role_summary,
    patch.role_manifest_path ?? current.role_manifest_path,
    patch.soul_path ?? current.soul_path,
    patch.memory_path !== undefined ? patch.memory_path : current.memory_path,
    patch.source_checksum ?? current.source_checksum,
    ts,
    id,
  );
}

export function getProfileRoleSpecById(id: string): ProfileRoleSpecRecord | null {
  const db = getDb();
  return db
    .prepare("SELECT * FROM profile_role_specs WHERE id = ?")
    .get(id) as ProfileRoleSpecRecord | null;
}

export function getProfileRoleSpecByProfileId(profileId: string): ProfileRoleSpecRecord | null {
  const db = getDb();
  return db
    .prepare("SELECT * FROM profile_role_specs WHERE profile_id = ?")
    .get(profileId) as ProfileRoleSpecRecord | null;
}

export function listProfileRoleSpecs(): ProfileRoleSpecRecord[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM profile_role_specs ORDER BY installed_at ASC")
    .all() as ProfileRoleSpecRecord[];
}

export function deleteProfileRoleSpecByProfileId(profileId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM profile_role_specs WHERE profile_id = ?").run(profileId);
}

// --- Runtime Instance CRUD ---

export function insertRuntimeInstance(record: Omit<RuntimeInstanceRecord, "created_at" | "updated_at">): RuntimeInstanceRecord {
  const db = getDb();
  const ts = now();
  db.prepare(
    `INSERT INTO runtime_instances (id, profile_id, runtime_type, host, port, base_url, status, pid, started_at, stopped_at, last_health_check_at, last_error, restart_count, last_exit_code, last_crash_at, auto_restart, health_fail_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id, record.profile_id, record.runtime_type, record.host, record.port,
    record.base_url, record.status, record.pid, record.started_at, record.stopped_at,
    record.last_health_check_at, record.last_error,
    record.restart_count ?? 0, record.last_exit_code ?? null, record.last_crash_at ?? null,
    record.auto_restart !== undefined ? (record.auto_restart ? 1 : 0) : 1,
    record.health_fail_count ?? 0,
    ts, ts,
  );
  return { ...record, created_at: ts, updated_at: ts };
}

export function getRuntimeInstance(profileId: string): RuntimeInstanceRecord | null {
  const db = getDb();
  return db.prepare("SELECT * FROM runtime_instances WHERE profile_id = ?").get(profileId) as RuntimeInstanceRecord | null;
}

export function listRuntimeInstances(): RuntimeInstanceRecord[] {
  const db = getDb();
  return db.prepare("SELECT * FROM runtime_instances").all() as RuntimeInstanceRecord[];
}

export interface RuntimeStatusUpdateExtra {
  pid?: number | null;
  lastError?: string;
  startedAt?: string;
  stoppedAt?: string;
  lastHealthCheckAt?: string;
  restartCount?: number;
  lastExitCode?: number | null;
  lastCrashAt?: string | null;
  healthFailCount?: number;
  autoRestart?: boolean;
}

export function updateRuntimeStatus(
  profileId: string,
  status: ProfileRuntimeStatus | undefined,
  extra?: RuntimeStatusUpdateExtra,
): void {
  const db = getDb();
  const ts = now();
  const current = getRuntimeInstance(profileId);
  if (!current) return;

  const resolvedStatus = status ?? current.status;

  db.prepare(
    `UPDATE runtime_instances SET status = ?, pid = ?, last_error = ?, started_at = ?, stopped_at = ?, last_health_check_at = ?, restart_count = ?, last_exit_code = ?, last_crash_at = ?, health_fail_count = ?, auto_restart = ?, updated_at = ? WHERE profile_id = ?`,
  ).run(
    resolvedStatus,
    extra?.pid ?? current.pid,
    extra?.lastError ?? current.last_error,
    extra?.startedAt ?? current.started_at,
    extra?.stoppedAt ?? current.stopped_at,
    extra?.lastHealthCheckAt ?? current.last_health_check_at,
    extra?.restartCount ?? current.restart_count,
    extra?.lastExitCode !== undefined ? extra.lastExitCode : current.last_exit_code,
    extra?.lastCrashAt !== undefined ? extra.lastCrashAt : current.last_crash_at,
    extra?.healthFailCount ?? current.health_fail_count,
    extra?.autoRestart !== undefined ? (extra.autoRestart ? 1 : 0) : current.auto_restart,
    ts,
    profileId,
  );
}

export function checkPortConflict(host: string, port: number, excludeProfileId?: string): RuntimeInstanceRecord | null {
  const db = getDb();
  if (excludeProfileId) {
    return db.prepare("SELECT * FROM runtime_instances WHERE host = ? AND port = ? AND profile_id != ?").get(host, port, excludeProfileId) as RuntimeInstanceRecord | null;
  }
  return db.prepare("SELECT * FROM runtime_instances WHERE host = ? AND port = ?").get(host, port) as RuntimeInstanceRecord | null;
}

// --- Profile Entry CRUD ---

export function insertProfileEntry(record: Omit<ProfileEntryRecord, "created_at" | "updated_at">): ProfileEntryRecord {
  const db = getDb();
  const ts = now();
  db.prepare(
    `INSERT INTO profile_entries (id, profile_id, entry_type, route, title, icon, enabled, sort_order, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id, record.profile_id, record.entry_type, record.route, record.title,
    record.icon, record.enabled ? 1 : 0, record.sort_order, record.config_json, ts, ts,
  );
  return { ...record, created_at: ts, updated_at: ts };
}

export function listProfileEntries(): ProfileEntryRecord[] {
  const db = getDb();
  return db.prepare("SELECT * FROM profile_entries WHERE enabled = 1 ORDER BY sort_order ASC").all() as ProfileEntryRecord[];
}

export function getProfileEntry(profileId: string): ProfileEntryRecord | null {
  const db = getDb();
  return db.prepare("SELECT * FROM profile_entries WHERE profile_id = ?").get(profileId) as ProfileEntryRecord | null;
}

export function updateProfileEntryLayout(profileId: string, configJson: string): void {
  const db = getDb();
  const ts = now();
  db.prepare("UPDATE profile_entries SET config_json = ?, updated_at = ? WHERE profile_id = ?").run(configJson, ts, profileId);
}

// --- Capability CRUD ---

export function insertCapability(record: Omit<ProfileCapabilityRecord, "created_at" | "updated_at">): ProfileCapabilityRecord {
  const db = getDb();
  const ts = now();
  db.prepare(
    `INSERT INTO profile_capabilities (id, profile_id, capability_name, enabled, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(record.id, record.profile_id, record.capability_name, record.enabled ? 1 : 0, record.config_json, ts, ts);
  return { ...record, created_at: ts, updated_at: ts };
}

export function getCapabilities(profileId: string): ProfileCapabilityRecord[] {
  const db = getDb();
  return db.prepare("SELECT * FROM profile_capabilities WHERE profile_id = ?").all(profileId) as ProfileCapabilityRecord[];
}

// --- Skill CRUD ---

export function insertSkill(record: Omit<ProfileSkillRecord, "installed_at" | "updated_at">): ProfileSkillRecord {
  const db = getDb();
  const ts = now();
  db.prepare(
    `INSERT INTO profile_skills (id, profile_id, skill_path, skill_name, category, source_type, source_profile_id, filesystem_path, checksum, enabled, installed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id, record.profile_id, record.skill_path, record.skill_name, record.category,
    record.source_type, record.source_profile_id, record.filesystem_path, record.checksum,
    record.enabled ? 1 : 0, ts, ts,
  );
  return { ...record, installed_at: ts, updated_at: ts };
}

export function listSkills(profileId: string): ProfileSkillRecord[] {
  const db = getDb();
  return db.prepare("SELECT * FROM profile_skills WHERE profile_id = ?").all(profileId) as ProfileSkillRecord[];
}

export function deleteSkillsByProfileAndCategory(profileId: string, category: string): void {
  const db = getDb();
  db.prepare("DELETE FROM profile_skills WHERE profile_id = ? AND category = ?").run(profileId, category);
}

// --- Event writes ---

export function insertSkillSyncEvent(record: Omit<SkillSyncEventRecord, "created_at">): SkillSyncEventRecord {
  const db = getDb();
  const ts = now();
  db.prepare(
    `INSERT INTO skill_sync_events (id, source_profile_id, target_profile_id, skill_path, action, overwrite, backup_path, status, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id, record.source_profile_id, record.target_profile_id, record.skill_path,
    record.action, record.overwrite ? 1 : 0, record.backup_path, record.status, record.error_message, ts,
  );
  return { ...record, created_at: ts };
}

export function insertSharedContext(record: Omit<SharedContextRecord, "created_at" | "updated_at">): SharedContextRecord {
  const db = getDb();
  const ts = now();
  db.prepare(
    `INSERT INTO shared_contexts (id, source_profile_id, source_session_id, target_profile_id, mode, title, summary, context_file_path, message_count, max_chars, checksum, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id, record.source_profile_id, record.source_session_id, record.target_profile_id,
    record.mode, record.title, record.summary, record.context_file_path, record.message_count,
    record.max_chars, record.checksum, record.status, ts, ts,
  );
  return { ...record, created_at: ts, updated_at: ts };
}

export function insertDelegationEvent(record: Omit<DelegationEventRecord, never>): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO delegation_events (id, from_profile_id, to_profile_id, request_message, context_refs_json, response_summary, target_session_id, status, error_message, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id, record.from_profile_id, record.to_profile_id, record.request_message,
    record.context_refs_json, record.response_summary, record.target_session_id,
    record.status, record.error_message, record.started_at, record.completed_at,
  );
}

export function insertAuditEvent(record: Omit<AuditEventRecord, "created_at">): AuditEventRecord {
  const db = getDb();
  const ts = now();
  db.prepare(
    `INSERT INTO audit_events (id, event_type, profile_id, source, action, payload_json, status, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id, record.event_type, record.profile_id, record.source, record.action,
    record.payload_json, record.status, record.error_message, ts,
  );
  return { ...record, created_at: ts };
}

// --- Event queries ---

export function listAuditEvents(filter: { profileId?: string; eventType?: string; limit?: number; offset?: number }): AuditEventRecord[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.profileId) { conditions.push("profile_id = ?"); params.push(filter.profileId); }
  if (filter.eventType) { conditions.push("event_type = ?"); params.push(filter.eventType); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ?? 100;
  const offset = filter.offset ?? 0;
  return db.prepare(`SELECT * FROM audit_events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as AuditEventRecord[];
}

export function listDelegationEvents(profileId?: string): DelegationEventRecord[] {
  const db = getDb();
  if (profileId) {
    return db.prepare("SELECT * FROM delegation_events WHERE from_profile_id = ? OR to_profile_id = ? ORDER BY started_at DESC").all(profileId, profileId) as DelegationEventRecord[];
  }
  return db.prepare("SELECT * FROM delegation_events ORDER BY started_at DESC").all() as DelegationEventRecord[];
}

export function listSkillSyncEvents(profileId?: string): SkillSyncEventRecord[] {
  const db = getDb();
  if (profileId) {
    return db.prepare("SELECT * FROM skill_sync_events WHERE source_profile_id = ? OR target_profile_id = ? ORDER BY created_at DESC").all(profileId, profileId) as SkillSyncEventRecord[];
  }
  return db.prepare("SELECT * FROM skill_sync_events ORDER BY created_at DESC").all() as SkillSyncEventRecord[];
}

export function listSharedContexts(profileId?: string): SharedContextRecord[] {
  const db = getDb();
  if (profileId) {
    return db.prepare("SELECT * FROM shared_contexts WHERE target_profile_id = ? OR source_profile_id = ? ORDER BY created_at DESC").all(profileId, profileId) as SharedContextRecord[];
  }
  return db.prepare("SELECT * FROM shared_contexts ORDER BY created_at DESC").all() as SharedContextRecord[];
}

export function deleteSharedContext(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM shared_contexts WHERE id = ?").run(id);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Runtime Services CRUD (v1.5 Portal tables)
// ---------------------------------------------------------------------------

export function upsertRuntimeService(record: RuntimeServiceRecord): RuntimeServiceRecord {
  const db = getDb();
  const ts = now();
  db.prepare(
    `INSERT INTO runtime_services (service_id, service_type, display_name, status, pid, port, url, install_path, started_at, stopped_at, last_health_at, last_error, restart_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(service_id) DO UPDATE SET
       status = excluded.status,
       pid = excluded.pid,
       port = excluded.port,
       url = excluded.url,
       install_path = excluded.install_path,
       started_at = excluded.started_at,
       stopped_at = excluded.stopped_at,
       last_health_at = excluded.last_health_at,
       last_error = excluded.last_error,
       restart_count = excluded.restart_count,
       updated_at = excluded.updated_at`,
  ).run(
    record.service_id, record.service_type, record.display_name, record.status,
    record.pid, record.port, record.url, record.install_path,
    record.started_at, record.stopped_at, record.last_health_at, record.last_error,
    record.restart_count, ts,
  );
  return { ...record, updated_at: ts };
}

export function getRuntimeService(serviceId: AiOsServiceId): RuntimeServiceRecord | null {
  const db = getDb();
  return db.prepare("SELECT * FROM runtime_services WHERE service_id = ?").get(serviceId) as RuntimeServiceRecord | null;
}

export function listRuntimeServices(): RuntimeServiceRecord[] {
  const db = getDb();
  return db.prepare("SELECT * FROM runtime_services ORDER BY service_id").all() as RuntimeServiceRecord[];
}

export function updateRuntimeServiceStatus(
  serviceId: AiOsServiceId,
  status: RuntimeServiceStatus,
  extra?: Partial<Pick<RuntimeServiceRecord, "pid" | "port" | "url" | "started_at" | "stopped_at" | "last_health_at" | "last_error" | "restart_count">>,
): void {
  const db = getDb();
  const ts = now();
  const current = getRuntimeService(serviceId);
  if (!current) return;

  db.prepare(
    `UPDATE runtime_services SET status = ?, pid = ?, port = ?, url = ?, started_at = ?, stopped_at = ?, last_health_at = ?, last_error = ?, restart_count = ?, updated_at = ? WHERE service_id = ?`,
  ).run(
    status,
    extra?.pid ?? current.pid,
    extra?.port ?? current.port,
    extra?.url ?? current.url,
    extra?.started_at ?? current.started_at,
    extra?.stopped_at ?? current.stopped_at,
    extra?.last_health_at ?? current.last_health_at,
    extra?.last_error ?? current.last_error,
    extra?.restart_count ?? current.restart_count,
    ts,
    serviceId,
  );
}

export function insertRuntimeServiceEvent(record: Omit<RuntimeEventRecord, "created_at">): RuntimeEventRecord {
  const db = getDb();
  const ts = now();
  db.prepare(
    `INSERT INTO runtime_service_events (id, service_id, event_type, level, message, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(record.id, record.service_id, record.event_type, record.level, record.message, record.payload_json, ts);
  return { ...record, created_at: ts };
}

export function listRuntimeServiceEvents(
  serviceId?: string,
  options?: { limit?: number; level?: RuntimeEventLevel; since?: string },
): RuntimeEventRecord[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (serviceId) { conditions.push("service_id = ?"); params.push(serviceId); }
  if (options?.level) { conditions.push("level = ?"); params.push(options.level); }
  if (options?.since) { conditions.push("created_at >= ?"); params.push(options.since); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = options?.limit ?? 200;
  return db.prepare(`SELECT * FROM runtime_service_events ${where} ORDER BY created_at DESC LIMIT ?`).all(...params, limit) as RuntimeEventRecord[];
}

export function getRuntimeSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value_json FROM runtime_settings WHERE key = ?").get(key) as { value_json: string } | undefined;
  return row?.value_json ?? null;
}

export function setRuntimeSetting(key: string, valueJson: string): void {
  const db = getDb();
  const ts = now();
  db.prepare(
    `INSERT INTO runtime_settings (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(key, valueJson, ts);
}

export { randomUUID as generateId };
