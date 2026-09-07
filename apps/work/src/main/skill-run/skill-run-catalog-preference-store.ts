/**
 * Auth-scoped Skill Catalog favorite and recent name store.
 * Names only. Not a second Catalog HTTP client.
 */

import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import type { SkillCatalogResponse } from "../../shared/skill-run";

export const FAVORITES_MAX = 50;
export const RECENT_MAX = 20;
export const FAVORITE_UNKNOWN_TOOL = "FAVORITE_UNKNOWN_TOOL";
export const FAVORITE_LIMIT_REACHED = "FAVORITE_LIMIT_REACHED";

const MAX_TOOL_NAME_LENGTH = 256;

export class SkillRunCatalogPreferenceError extends Error {
  readonly errorCode: string;

  constructor(errorCode: string, message: string) {
    super(message);
    this.name = "SkillRunCatalogPreferenceError";
    this.errorCode = errorCode;
  }
}

interface ScopeRecord {
  favorites: string[];
  recent: string[];
}

interface StoreFile {
  scopes?: Record<string, ScopeRecord>;
}

export interface SkillRunCatalogPreferenceStore {
  overlayCatalog(scopeKey: string, catalog: SkillCatalogResponse): SkillCatalogResponse;
  setFavorite(
    scopeKey: string,
    toolName: string,
    favorited: boolean,
    catalogToolNames: ReadonlySet<string>,
  ): void;
  recordRecent(scopeKey: string, toolName: string): void;
}

export interface CreateSkillRunCatalogPreferenceStoreOptions {
  getPath?: () => string;
}

let fallbackSeq = 0;

function defaultStorePath(): string {
  try {
    return join(app.getPath("userData"), "skill-run-catalog-preferences.json");
  } catch {
    fallbackSeq += 1;
    return join(
      tmpdir(),
      `skill-run-catalog-preferences-${process.pid}-${fallbackSeq}.json`,
    );
  }
}

function sanitizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.length > MAX_TOOL_NAME_LENGTH) return null;
  return name;
}

function sanitizeScopeRecord(raw: unknown): ScopeRecord {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { favorites: [], recent: [] };
  }
  const record = raw as { favorites?: unknown; recent?: unknown };
  const favorites: string[] = [];
  const seenFavorites = new Set<string>();
  if (Array.isArray(record.favorites)) {
    for (const item of record.favorites) {
      const name = sanitizeName(item);
      if (!name || seenFavorites.has(name)) continue;
      seenFavorites.add(name);
      favorites.push(name);
      if (favorites.length >= FAVORITES_MAX) break;
    }
  }
  const recent: string[] = [];
  const seenRecent = new Set<string>();
  if (Array.isArray(record.recent)) {
    for (const item of record.recent) {
      const name = sanitizeName(item);
      if (!name || seenRecent.has(name)) continue;
      seenRecent.add(name);
      recent.push(name);
      if (recent.length >= RECENT_MAX) break;
    }
  }
  return { favorites, recent };
}

export function createSkillRunCatalogPreferenceStore(
  options: CreateSkillRunCatalogPreferenceStoreOptions = {},
): SkillRunCatalogPreferenceStore {
  const resolvePath = options.getPath ?? defaultStorePath;

  function loadAll(): Record<string, ScopeRecord> {
    const file = resolvePath();
    if (!existsSync(file)) return {};
    try {
      const parsed = JSON.parse(readFileSync(file, "utf-8")) as StoreFile;
      const scopes = parsed.scopes;
      if (!scopes || typeof scopes !== "object" || Array.isArray(scopes)) {
        return {};
      }
      const out: Record<string, ScopeRecord> = {};
      for (const [key, value] of Object.entries(scopes)) {
        if (!key) continue;
        out[key] = sanitizeScopeRecord(value);
      }
      return out;
    } catch {
      return {};
    }
  }

  function persistAll(scopes: Record<string, ScopeRecord>): void {
    const file = resolvePath();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ scopes }, null, 2), "utf-8");
  }

  function readScope(scopeKey: string): ScopeRecord {
    const scopes = loadAll();
    return scopes[scopeKey] ?? { favorites: [], recent: [] };
  }

  function writeScope(scopeKey: string, record: ScopeRecord): void {
    const scopes = loadAll();
    scopes[scopeKey] = record;
    persistAll(scopes);
  }

  return {
    overlayCatalog(scopeKey: string, catalog: SkillCatalogResponse): SkillCatalogResponse {
      if (catalog.status !== "ready") {
        return catalog;
      }
      const record = readScope(scopeKey);
      const favoriteSet = new Set(record.favorites);
      const recentRank = new Map(record.recent.map((name, index) => [name, index + 1]));
      return {
        ...catalog,
        tools: catalog.tools.map((tool) => {
          const rank = recentRank.get(tool.toolName);
          return {
            ...tool,
            favorited: favoriteSet.has(tool.toolName),
            ...(rank !== undefined ? { recentRank: rank } : {}),
          };
        }),
      };
    },

    setFavorite(
      scopeKey: string,
      toolName: string,
      favorited: boolean,
      catalogToolNames: ReadonlySet<string>,
    ): void {
      const name = sanitizeName(toolName);
      if (!name || !catalogToolNames.has(name)) {
        throw new SkillRunCatalogPreferenceError(
          FAVORITE_UNKNOWN_TOOL,
          "Skill is not in the current catalog.",
        );
      }
      const record = readScope(scopeKey);
      const already = record.favorites.includes(name);
      if (favorited) {
        if (already) return;
        if (record.favorites.length >= FAVORITES_MAX) {
          throw new SkillRunCatalogPreferenceError(
            FAVORITE_LIMIT_REACHED,
            "Favorite limit reached.",
          );
        }
        writeScope(scopeKey, {
          ...record,
          favorites: [...record.favorites, name],
        });
        return;
      }
      if (!already) return;
      writeScope(scopeKey, {
        ...record,
        favorites: record.favorites.filter((item) => item !== name),
      });
    },

    recordRecent(scopeKey: string, toolName: string): void {
      const name = sanitizeName(toolName);
      if (!name) return;
      const record = readScope(scopeKey);
      const next = [name, ...record.recent.filter((item) => item !== name)].slice(
        0,
        RECENT_MAX,
      );
      writeScope(scopeKey, { ...record, recent: next });
    },
  };
}
