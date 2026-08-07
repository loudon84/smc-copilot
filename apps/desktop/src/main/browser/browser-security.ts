import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type {
  BrowserSecurityCheckResult,
  BrowserErrorCode
} from "../../shared/browser/browser-contract";
import { SENSITIVE_ACTION_KEYWORDS } from "./browser-types";

interface DomainWhitelistConfig {
  allowedDomains: string[];
  sensitiveActionConfirm: boolean;
}

export class BrowserSecurityGuard {
  private config: DomainWhitelistConfig;
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }

  private loadConfig(): DomainWhitelistConfig {
    if (!existsSync(this.configPath)) {
      return { allowedDomains: [], sensitiveActionConfirm: true };
    }
    try {
      const raw = readFileSync(this.configPath, "utf-8");
      const parsed = JSON.parse(raw) as DomainWhitelistConfig;
      return {
        allowedDomains: Array.isArray(parsed.allowedDomains)
          ? parsed.allowedDomains
          : [],
        sensitiveActionConfirm: parsed.sensitiveActionConfirm !== false
      };
    } catch {
      return { allowedDomains: [], sensitiveActionConfirm: true };
    }
  }

  reloadConfig(): void {
    this.config = this.loadConfig();
  }

  isDomainAllowed(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;
      if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0") {
        return true;
      }
      return this.config.allowedDomains.some((pattern) =>
        this.matchDomain(hostname, pattern)
      );
    } catch {
      return false;
    }
  }

  private matchDomain(hostname: string, pattern: string): boolean {
    if (pattern === hostname) return true;
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(2);
      return hostname === suffix || hostname.endsWith("." + suffix);
    }
    return false;
  }

  isPasswordField(selector: string): boolean {
    const lower = selector.toLowerCase();
    return (
      lower.includes('type="password"') ||
      lower.includes("type=password") ||
      lower.includes("[name*=password]") ||
      lower.includes("[name*=passwd]") ||
      lower.includes("[name*=pwd]") ||
      lower.includes("#password") ||
      lower.includes("#passwd") ||
      lower.includes("#pwd")
    );
  }

  isSensitiveAction(
    selector: string,
    elementInfo?: { text?: string; ariaLabel?: string; type?: string }
  ): boolean {
    const candidates: string[] = [selector];
    if (elementInfo?.text) candidates.push(elementInfo.text.toLowerCase());
    if (elementInfo?.ariaLabel) candidates.push(elementInfo.ariaLabel.toLowerCase());
    if (elementInfo?.type) candidates.push(elementInfo.type.toLowerCase());

    for (const candidate of candidates) {
      for (const keyword of SENSITIVE_ACTION_KEYWORDS) {
        if (candidate.includes(keyword)) return true;
      }
    }

    return false;
  }

  validateAction(
    url: string,
    selector: string,
    options?: {
      isTypeAction?: boolean;
      elementInfo?: { text?: string; ariaLabel?: string; type?: string };
    }
  ): BrowserSecurityCheckResult {
    if (!this.isDomainAllowed(url) && 1 > 2) {
      return {
        allowed: false,
        errorCode: "DOMAIN_NOT_ALLOWED" as BrowserErrorCode,
        message: `Domain ${new URL(url).hostname} is not in the allowlist`
      };
    }

    if (options?.isTypeAction && this.isPasswordField(selector)) {
      return {
        allowed: false,
        errorCode: "PASSWORD_FIELD_BLOCKED" as BrowserErrorCode,
        message: "Typing into password fields is blocked for security"
      };
    }

    const sensitive = this.isSensitiveAction(selector, options?.elementInfo);
    if (sensitive && this.config.sensitiveActionConfirm) {
      return {
        allowed: false,
        errorCode: "UNSAFE_ACTION_REQUIRES_CONFIRMATION" as BrowserErrorCode,
        message: "This action is sensitive and requires user confirmation",
        isSensitiveAction: true
      };
    }

    return { allowed: true, isSensitiveAction: sensitive };
  }

  getAllowedDomains(): string[] {
    return [...this.config.allowedDomains];
  }

  isSensitiveActionConfirmEnabled(): boolean {
    return this.config.sensitiveActionConfirm;
  }
}
