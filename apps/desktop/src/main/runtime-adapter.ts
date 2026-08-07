import type { ProfileGatewayState } from "../shared/profile-runtime/profile-runtime-contract";

export interface RuntimeAdapter {
  readonly type: string;
  readonly title: string;
  readonly version: string;

  validate(profileId: string): Promise<void>;
  deploy(profileId: string): Promise<void>;
  start(profileId: string): Promise<ProfileGatewayState>;
  stop(profileId: string): Promise<ProfileGatewayState>;
  restart(profileId: string): Promise<ProfileGatewayState>;
  health(profileId: string): Promise<ProfileGatewayState>;

  sendMessage(input: {
    profileId: string;
    message: string;
    sessionId?: string;
    history?: Array<{ role: string; content: string }>;
  }): Promise<{
    response: string;
    sessionId?: string;
  }>;
}
