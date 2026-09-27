import { NODESKCLAW_KEY_ENV } from "./runtime-provider-contract";

export const MANAGED_RUNTIME_KEY_ENV = NODESKCLAW_KEY_ENV;

interface SecretSlot {
  profile: string;
  epoch: string;
  apiKey: string;
  revision: string;
}

let slot: SecretSlot | null = null;
let epochCounter = 0;

function profileKey(profile?: string): string {
  const value = (profile || "default").trim();
  return value || "default";
}

export function currentIdentityEpoch(): string {
  return String(epochCounter);
}

export function rotateIdentityEpoch(): string {
  epochCounter += 1;
  slot = null;
  return currentIdentityEpoch();
}

export function installManagedSecret(input: {
  profile?: string;
  apiKey: string;
  revision: string;
}): void {
  slot = {
    profile: profileKey(input.profile),
    epoch: currentIdentityEpoch(),
    apiKey: input.apiKey,
    revision: input.revision,
  };
}

export function clearManagedSecret(profile?: string): void {
  if (!profile || (slot && slot.profile === profileKey(profile))) {
    slot = null;
  }
}

export function readManagedSecret(profile?: string): string | null {
  if (!slot || slot.profile !== profileKey(profile)) return null;
  if (slot.epoch !== currentIdentityEpoch()) return null;
  return slot.apiKey;
}

export function readManagedRevision(profile?: string): string | null {
  if (!slot || slot.profile !== profileKey(profile)) return null;
  return slot.revision;
}

export function applyManagedRuntimeSecretOverlay(
  env: Record<string, string | undefined>,
  profile?: string,
): Record<string, string | undefined> {
  const next = { ...env };
  delete next[MANAGED_RUNTIME_KEY_ENV];
  const secret = readManagedSecret(profile);
  if (secret) next[MANAGED_RUNTIME_KEY_ENV] = secret;
  return next;
}
