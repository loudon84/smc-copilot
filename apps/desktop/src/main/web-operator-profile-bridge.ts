import { insertAuditEvent, generateId } from "./profile-runtime-db";
import { ProfileRuntimeError } from "../shared/profile-runtime/profile-runtime-errors";

interface ProfileAwareAction {
  toolName: string;
  profileId: string;
  source: "user" | "hermes" | "system";
  gatewayPort?: number;
  args: Record<string, unknown>;
}

const SENSITIVE_ACTIONS = new Set(["browser.type", "browser.click"]);

class WebOperatorProfileBridge {
  private allowedProfiles: Set<string>;

  constructor(allowedProfiles?: string[]) {
    this.allowedProfiles = new Set(allowedProfiles ?? []);
  }

  allowProfile(profileId: string): void {
    this.allowedProfiles.add(profileId);
  }

  checkProfileAllowed(profileId: string): void {
    if (this.allowedProfiles.size > 0 && !this.allowedProfiles.has(profileId)) {
      throw new ProfileRuntimeError(
        "WEB_OPERATOR_PROFILE_NOT_ALLOWED",
        profileId,
      );
    }
  }

  injectSourceProfile(
    params: Record<string, unknown>,
    profileId: string,
  ): Record<string, unknown> {
    return { ...params, _profileId: profileId, _source: "profile-runtime" };
  }

  async executeAction(
    profileId: string,
    action: string,
    params: Record<string, unknown>,
    url?: string,
  ): Promise<{ ok: boolean; result?: unknown; error?: string }> {
    this.checkProfileAllowed(profileId);

    const enrichedParams = this.injectSourceProfile(params, profileId);
    const isSensitive = SENSITIVE_ACTIONS.has(action);

    try {
      insertAuditEvent({
        id: generateId(),
        event_type: "web_operator",
        profile_id: profileId,
        source: "hermes",
        action,
        payload_json: JSON.stringify({ url, args: Object.keys(params) }),
        status: "success",
        error_message: null,
      });

      return { ok: true, result: enrichedParams };
    } catch (e) {
      insertAuditEvent({
        id: generateId(),
        event_type: "web_operator",
        profile_id: profileId,
        source: "hermes",
        action,
        payload_json: JSON.stringify({ url, args: Object.keys(params) }),
        status: "failed",
        error_message: String(e),
      });

      return { ok: false, error: String(e) };
    }
  }

  isSensitiveAction(action: string): boolean {
    return SENSITIVE_ACTIONS.has(action);
  }

  async confirmAction(profileId: string, action: string): Promise<boolean> {
    if (!this.isSensitiveAction(action)) return true;

    insertAuditEvent({
      id: generateId(),
      event_type: "web_operator",
      profile_id: profileId,
      source: "user",
      action: `${action}_confirm_requested`,
      payload_json: null,
      status: "success",
      error_message: null,
    });

    return true;
  }
}

let bridgeInstance: WebOperatorProfileBridge | null = null;

export function getWebOperatorProfileBridge(
  allowedProfiles?: string[],
): WebOperatorProfileBridge {
  if (!bridgeInstance) {
    bridgeInstance = new WebOperatorProfileBridge(allowedProfiles);
  }
  return bridgeInstance;
}
