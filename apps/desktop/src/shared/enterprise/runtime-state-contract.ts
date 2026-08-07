export interface RuntimeState {
  installDir: string;
  agentPath: string;
  agentSourceExists: boolean;
  venvExists: boolean;
  hermesCliExists: boolean;
  modelConfigured: boolean;
  runtimeReady: boolean;
  needsAgentInstall: boolean;
  needsModelSetup: boolean;
  updateMode: boolean;
}
