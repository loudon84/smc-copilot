import { existsSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { getYamlPath } from "../yaml-path";
import { AUX_TASK_SLOTS, removeAuxiliaryField, setAuxiliaryField } from "../auxiliary-config";
import { getModelConfig } from "../config";
import { NODESKCLAW_PROVIDER_KEY } from "./runtime-provider-contract";
import { profileHome, safeWriteFile } from "../utils";

const FILE_NAME = "runtime-provider-auxiliary-adoption.json";
const FORBIDDEN = /secret|api_key|token|authorization|fingerprint/i;
const FIELDS = ["provider", "model", "base_url"] as const;

export interface AdoptionField {
  present: boolean;
  value: string | null;
}

export interface AuxiliaryAdoptionFile {
  schema_version: "1.0";
  profile: string;
  slots: Record<string, Record<(typeof FIELDS)[number], AdoptionField>>;
}

export type AuxiliaryAdoptionDecision =
  | { action: "reuse" }
  | { action: "capture" }
  | {
      action: "block";
      error:
        | "RUNTIME_AUXILIARY_ADOPTION_MISSING"
        | "RUNTIME_AUXILIARY_ADOPTION_INVALID";
    };

function profileForFiles(profile?: string): string | undefined {
  const value = (profile || "").trim();
  if (!value || value === "default") return undefined;
  return value;
}

function canonicalProfile(profile?: string): string {
  return profileForFiles(profile) || "default";
}

export function auxiliaryAdoptionPath(profile?: string): string {
  return join(profileHome(profileForFiles(profile)), FILE_NAME);
}

function fieldFromConfig(content: string, task: string, field: string): AdoptionField {
  const value = getYamlPath(content, `auxiliary.${task}.${field}`);
  if (value === null) return { present: false, value: null };
  return { present: true, value };
}

export function captureAuxiliaryAdoptionFromConfig(
  content: string,
  profile?: string,
): AuxiliaryAdoptionFile {
  const slots: AuxiliaryAdoptionFile["slots"] = {};
  for (const task of AUX_TASK_SLOTS) {
    slots[task] = {
      provider: fieldFromConfig(content, task, "provider"),
      model: fieldFromConfig(content, task, "model"),
      base_url: fieldFromConfig(content, task, "base_url"),
    };
  }
  return {
    schema_version: "1.0",
    profile: canonicalProfile(profile),
    slots,
  };
}

function hasForbiddenKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.keys(value as object).some((key) => FORBIDDEN.test(key)) ||
    Object.values(value as object).some((child) => hasForbiddenKey(child));
}

export function parseAuxiliaryAdoption(
  raw: string,
  profile?: string,
): AuxiliaryAdoptionFile | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (hasForbiddenKey(parsed)) return null;
    if (parsed.schema_version !== "1.0") return null;
    if (parsed.profile !== canonicalProfile(profile)) return null;
    if (!parsed.slots || typeof parsed.slots !== "object" || Array.isArray(parsed.slots)) {
      return null;
    }
    const slots = parsed.slots as Record<string, unknown>;
    const names = Object.keys(slots);
    if (names.length !== AUX_TASK_SLOTS.length) return null;
    const result: AuxiliaryAdoptionFile["slots"] = {};
    for (const task of AUX_TASK_SLOTS) {
      if (!names.includes(task)) return null;
      const slot = slots[task];
      if (!slot || typeof slot !== "object" || Array.isArray(slot)) return null;
      const record = slot as Record<string, unknown>;
      if (Object.keys(record).some((key) => !FIELDS.includes(key as (typeof FIELDS)[number]))) {
        return null;
      }
      const next = {} as AuxiliaryAdoptionFile["slots"][string];
      for (const field of FIELDS) {
        const item = record[field];
        if (!item || typeof item !== "object") return null;
        const body = item as { present?: unknown; value?: unknown };
        if (typeof body.present !== "boolean") return null;
        if (body.present && typeof body.value !== "string") return null;
        if (!body.present && body.value !== null) return null;
        next[field] = { present: body.present, value: body.present ? body.value as string : null };
      }
      result[task] = next;
    }
    return { schema_version: "1.0", profile: canonicalProfile(profile), slots: result };
  } catch {
    return null;
  }
}

export function readAuxiliaryAdoption(profile?: string): AuxiliaryAdoptionFile | null {
  const path = auxiliaryAdoptionPath(profile);
  if (!existsSync(path)) return null;
  return parseAuxiliaryAdoption(readFileSync(path, "utf-8"), profile);
}

export function inspectAuxiliaryAdoption(profile?: string): AuxiliaryAdoptionDecision {
  const path = auxiliaryAdoptionPath(profile);
  if (existsSync(path)) {
    return readAuxiliaryAdoption(profile)
      ? { action: "reuse" }
      : { action: "block", error: "RUNTIME_AUXILIARY_ADOPTION_INVALID" };
  }
  if (getModelConfig(profile).provider === NODESKCLAW_PROVIDER_KEY) {
    return { action: "block", error: "RUNTIME_AUXILIARY_ADOPTION_MISSING" };
  }
  return { action: "capture" };
}

export function writeAuxiliaryAdoption(profile: string | undefined, content: string): void {
  const captured = captureAuxiliaryAdoptionFromConfig(content, profile);
  safeWriteFile(auxiliaryAdoptionPath(profile), `${JSON.stringify(captured)}\n`);
}

export function projectContainedAuxiliary(content: string): string {
  let next = content;
  for (const task of AUX_TASK_SLOTS) {
    next = setAuxiliaryField(next, task, "provider", "auto");
    next = setAuxiliaryField(next, task, "model", "");
    next = setAuxiliaryField(next, task, "base_url", "");
    next = removeAuxiliaryField(next, task, "api_key");
  }
  return next;
}

export function restoreAuxiliaryFromAdoption(
  content: string,
  adoption: AuxiliaryAdoptionFile,
): string {
  let next = content;
  for (const task of AUX_TASK_SLOTS) {
    const slot = adoption.slots[task];
    for (const field of FIELDS) {
      const item = slot[field];
      next = item.present
        ? setAuxiliaryField(next, task, field, item.value || "")
        : removeAuxiliaryField(next, task, field);
    }
  }
  return next;
}

export function deleteAuxiliaryAdoption(profile?: string): void {
  const path = auxiliaryAdoptionPath(profile);
  if (existsSync(path)) unlinkSync(path);
}

export function auxiliaryRouteDrift(content: string): boolean {
  for (const task of AUX_TASK_SLOTS) {
    if (getYamlPath(content, `auxiliary.${task}.provider`) !== "auto") return true;
    if (getYamlPath(content, `auxiliary.${task}.model`) !== "") return true;
    if (getYamlPath(content, `auxiliary.${task}.base_url`) !== "") return true;
    if (getYamlPath(content, `auxiliary.${task}.api_key`) !== null) return true;
  }
  return false;
}
