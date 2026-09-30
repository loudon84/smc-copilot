export interface RuntimeProviderStateEvent {
  profile: string;
  state: string;
  backendState: string | null;
  errorCode: string | null;
  revision: string | null;
  providerRef: string | null;
  defaultModel: string | null;
  modelIds: string[];
  modelCount: number;
}
