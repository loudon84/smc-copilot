import type { RuntimeAdapter } from "./runtime-adapter";
import type { CapabilityPlugin } from "./capability-plugin";

class PluginRegistry {
  private adapters = new Map<string, RuntimeAdapter>();
  private capabilities = new Map<string, CapabilityPlugin>();

  registerAdapter(adapter: RuntimeAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  registerCapability(capability: CapabilityPlugin): void {
    this.capabilities.set(capability.name, capability);
  }

  getAdapter(type: string): RuntimeAdapter | undefined {
    return this.adapters.get(type);
  }

  getCapability(name: string): CapabilityPlugin | undefined {
    return this.capabilities.get(name);
  }

  listAdapterTypes(): string[] {
    return Array.from(this.adapters.keys());
  }

  listCapabilityNames(): string[] {
    return Array.from(this.capabilities.keys());
  }
}

let registryInstance: PluginRegistry | null = null;

export function getPluginRegistry(): PluginRegistry {
  if (!registryInstance) {
    registryInstance = new PluginRegistry();
  }
  return registryInstance;
}
