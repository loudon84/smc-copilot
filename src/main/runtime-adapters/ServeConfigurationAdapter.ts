/**
 * Serve Configuration / Models / Secrets adapter (Phase 2).
 */
import { configurationClient } from "../copilot-runtime-client/clients/configuration-client";
import { secretsClient, sanitizeSecretMeta } from "../copilot-runtime-client/clients/secrets-client";
import { ServeInstanceAdapter } from "./ServeInstanceAdapter";
import type {
  ServeModelConfigView,
  ServeSecretMeta,
} from "../../shared/copilot-runtime/instance-contract";

export const ServeConfigurationAdapter = {
  name: "ServeConfigurationAdapter" as const,

  get ready(): boolean {
    return ServeInstanceAdapter.ready;
  },

  async getConfiguration(profileRef?: string): Promise<unknown> {
    const instanceId = await ServeInstanceAdapter.resolveInstanceId(profileRef);
    return configurationClient.get(instanceId);
  },

  async patchConfiguration(profileRef: string | undefined, body: Record<string, unknown>): Promise<unknown> {
    const instanceId = await ServeInstanceAdapter.resolveInstanceId(profileRef);
    return configurationClient.patch(instanceId, body);
  },

  async validate(profileRef?: string, body?: Record<string, unknown>): Promise<unknown> {
    const instanceId = await ServeInstanceAdapter.resolveInstanceId(profileRef);
    return configurationClient.validate(instanceId, body);
  },

  async apply(profileRef?: string, body?: Record<string, unknown>): Promise<unknown> {
    const instanceId = await ServeInstanceAdapter.resolveInstanceId(profileRef);
    return configurationClient.apply(instanceId, body);
  },

  async reload(profileRef?: string): Promise<unknown> {
    const instanceId = await ServeInstanceAdapter.resolveInstanceId(profileRef);
    return configurationClient.reload(instanceId);
  },

  async getModelConfig(profileRef?: string): Promise<ServeModelConfigView> {
    const instanceId = await ServeInstanceAdapter.resolveInstanceId(profileRef);
    return configurationClient.getModelConfig(instanceId);
  },

  async setModelConfig(profileRef: string | undefined, body: Record<string, unknown>): Promise<unknown> {
    const instanceId = await ServeInstanceAdapter.resolveInstanceId(profileRef);
    return configurationClient.setModelConfig(instanceId, body);
  },

  async listSecrets(scope: string): Promise<ServeSecretMeta[]> {
    return (await secretsClient.list(scope)).map(sanitizeSecretMeta);
  },

  async putSecret(scope: string, name: string, value: string): Promise<ServeSecretMeta> {
    return sanitizeSecretMeta(await secretsClient.put(scope, name, value));
  },

  async deleteSecret(scope: string, name: string): Promise<void> {
    await secretsClient.delete(scope, name);
  },
};
