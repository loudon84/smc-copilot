export interface CapabilityPlugin {
  readonly name: string;
  initialize?(db: unknown): Promise<void>;
}
