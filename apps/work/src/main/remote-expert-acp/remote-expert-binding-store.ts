import type Database from "better-sqlite3";
import {
  ACP_ADAPTER_CONTRACT_VERSION,
  ACP_PROTOCOL_VERSION,
  REMOTE_AGENT_CONTRACT_VERSION,
  REMOTE_EXPERT_CATALOG_VERSION,
  REMOTE_EXPERT_PROVIDER,
  type RemoteExpertBindingState,
} from "../../shared/remote-expert-acp/contract";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";
import type { RemoteExpertProfileDraft } from "../../shared/remote-expert-acp/contract";
import { profileDigest } from "./profile-digest";
import type { ContractLockFile } from "./contract-lock";

const TABLE = "desktop_remote_expert_bindings";

export interface RemoteExpertBindingRow {
  sessionScope: string;
  profileId: string;
  sessionId: string;
  provider: typeof REMOTE_EXPERT_PROVIDER;
  agentRef: string;
  acpSessionId: string;
  profileName: string;
  profileDigest: string;
  knowledgeRefs: string[];
  connectorBindingRefs: string[];
  integrationAccountRefs: string[];
  contractTag: string;
  contractBundleDigest: string;
  acpProtocolVersion: number;
  acpAdapterVersion: string;
  acpAdapterDigest: string;
  catalogVersion: string;
  catalogDigest: string;
  remoteAgentVersion: string;
  remoteAgentDigest: string;
  state: RemoteExpertBindingState;
  createdAt: number;
  updatedAt: number;
}

function parseJsonArray(raw: string): string[] {
  const value = JSON.parse(raw) as unknown;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new RemoteExpertError("REMOTE_PROFILE_INVALID", "invalid persisted refs");
  }
  return value;
}

export function ensureRemoteExpertBindingTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      session_scope TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      provider TEXT NOT NULL CHECK(provider='nodeskclaw-acp'),
      agent_ref TEXT NOT NULL,
      acp_session_id TEXT NOT NULL,
      profile_name TEXT NOT NULL,
      profile_digest TEXT NOT NULL,
      knowledge_refs_json TEXT NOT NULL,
      connector_binding_refs_json TEXT NOT NULL,
      integration_account_refs_json TEXT NOT NULL,
      contract_tag TEXT NOT NULL,
      contract_bundle_digest TEXT NOT NULL,
      acp_protocol_version INTEGER NOT NULL,
      acp_adapter_version TEXT NOT NULL,
      acp_adapter_digest TEXT NOT NULL,
      catalog_version TEXT NOT NULL,
      catalog_digest TEXT NOT NULL,
      remote_agent_version TEXT NOT NULL,
      remote_agent_digest TEXT NOT NULL,
      state TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(session_scope, profile_id, session_id),
      UNIQUE(session_scope, profile_id, acp_session_id)
    )
  `);
}

function rowFromDb(row: Record<string, unknown>): RemoteExpertBindingRow {
  return {
    sessionScope: String(row.session_scope),
    profileId: String(row.profile_id),
    sessionId: String(row.session_id),
    provider: REMOTE_EXPERT_PROVIDER,
    agentRef: String(row.agent_ref),
    acpSessionId: String(row.acp_session_id),
    profileName: String(row.profile_name),
    profileDigest: String(row.profile_digest),
    knowledgeRefs: parseJsonArray(String(row.knowledge_refs_json)),
    connectorBindingRefs: parseJsonArray(String(row.connector_binding_refs_json)),
    integrationAccountRefs: parseJsonArray(String(row.integration_account_refs_json)),
    contractTag: String(row.contract_tag),
    contractBundleDigest: String(row.contract_bundle_digest),
    acpProtocolVersion: Number(row.acp_protocol_version),
    acpAdapterVersion: String(row.acp_adapter_version),
    acpAdapterDigest: String(row.acp_adapter_digest),
    catalogVersion: String(row.catalog_version),
    catalogDigest: String(row.catalog_digest),
    remoteAgentVersion: String(row.remote_agent_version),
    remoteAgentDigest: String(row.remote_agent_digest),
    state: row.state as RemoteExpertBindingState,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function insertRemoteExpertBinding(
  db: Database.Database,
  input: {
    sessionScope: string;
    profileId: string;
    sessionId: string;
    acpSessionId: string;
    profile: RemoteExpertProfileDraft;
    lock: ContractLockFile;
    now?: number;
  },
): RemoteExpertBindingRow {
  ensureRemoteExpertBindingTable(db);
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const digest = profileDigest(input.profile);
  try {
    db.prepare(
      `INSERT INTO ${TABLE} (
        session_scope, profile_id, session_id, provider, agent_ref, acp_session_id,
        profile_name, profile_digest, knowledge_refs_json, connector_binding_refs_json,
        integration_account_refs_json, contract_tag, contract_bundle_digest,
        acp_protocol_version, acp_adapter_version, acp_adapter_digest,
        catalog_version, catalog_digest, remote_agent_version, remote_agent_digest,
        state, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    ).run(
      input.sessionScope,
      input.profileId,
      input.sessionId,
      REMOTE_EXPERT_PROVIDER,
      input.profile.agent_ref,
      input.acpSessionId,
      input.profile.name,
      digest,
      JSON.stringify(input.profile.knowledge_refs),
      JSON.stringify(input.profile.connector_binding_refs),
      JSON.stringify(input.profile.integration_account_refs),
      input.lock.tag,
      input.lock.bundleDigest,
      ACP_PROTOCOL_VERSION,
      ACP_ADAPTER_CONTRACT_VERSION,
      input.lock.components.acpAdapter.consumerDigest,
      REMOTE_EXPERT_CATALOG_VERSION,
      input.lock.components.remoteExpertCatalog.consumerDigest,
      REMOTE_AGENT_CONTRACT_VERSION,
      input.lock.components.remoteAgent.consumerDigest,
      now,
      now,
    );
  } catch (err) {
    throw new RemoteExpertError("REMOTE_BINDING_CONFLICT", "binding insert failed", {
      cause: String(err),
    });
  }
  const written = getRemoteExpertBinding(db, {
    sessionScope: input.sessionScope,
    profileId: input.profileId,
    sessionId: input.sessionId,
  });
  if (!written) {
    throw new RemoteExpertError("REMOTE_BINDING_NOT_FOUND", "binding not readable after insert");
  }
  return written;
}

export function getRemoteExpertBinding(
  db: Database.Database,
  identity: { sessionScope: string; profileId: string; sessionId: string },
): RemoteExpertBindingRow | null {
  ensureRemoteExpertBindingTable(db);
  const row = db
    .prepare(
      `SELECT * FROM ${TABLE} WHERE session_scope = ? AND profile_id = ? AND session_id = ?`,
    )
    .get(identity.sessionScope, identity.profileId, identity.sessionId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowFromDb(row) : null;
}

export function getRemoteExpertBindingBySessionId(
  db: Database.Database,
  sessionId: string,
): RemoteExpertBindingRow | null {
  ensureRemoteExpertBindingTable(db);
  const row = db
    .prepare(`SELECT * FROM ${TABLE} WHERE session_id = ? LIMIT 1`)
    .get(sessionId) as Record<string, unknown> | undefined;
  return row ? rowFromDb(row) : null;
}

export function markRemoteExpertBindingState(
  db: Database.Database,
  identity: { sessionScope: string; profileId: string; sessionId: string },
  state: RemoteExpertBindingState,
): void {
  ensureRemoteExpertBindingTable(db);
  const now = Math.floor(Date.now() / 1000);
  const result = db
    .prepare(
      `UPDATE ${TABLE} SET state = ?, updated_at = ? WHERE session_scope = ? AND profile_id = ? AND session_id = ?`,
    )
    .run(state, now, identity.sessionScope, identity.profileId, identity.sessionId);
  if (Number(result.changes ?? 0) === 0) {
    throw new RemoteExpertError("REMOTE_BINDING_NOT_FOUND", "binding missing");
  }
}
