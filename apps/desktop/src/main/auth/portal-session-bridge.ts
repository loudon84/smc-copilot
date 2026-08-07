import { app, safeStorage, session, type Cookie } from "electron";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { AIOS_HOME_PARTITION } from "../../shared/shell/browser-partitions";
import {
  isPortalSessionCookieName,
  type PersistedPortalCookie,
} from "../../shared/auth/portal-session-cookies";

const KEYTAR_SERVICE = "hermes-desktop-auth";
const KEYTAR_PORTAL_ACCOUNT = "portal-session-cookies";
const PORTAL_COOKIES_FILE = () => join(app.getPath("userData"), "auth", "portal-cookies.enc");

type KeytarModule = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

type ElectronSession = ReturnType<typeof session.fromPartition>;

function portalBridgeEnabled(): boolean {
  return process.env.HERMES_PORTAL_SESSION_BRIDGE !== "false";
}

async function loadKeytar(): Promise<KeytarModule | null> {
  try {
    const mod = await import("keytar");
    return (mod as { default?: KeytarModule }).default ?? (mod as KeytarModule);
  } catch {
    return null;
  }
}

function aiosHomeSession(): ElectronSession {
  return session.fromPartition(AIOS_HOME_PARTITION);
}

function portalOrigin(aiosHomeUrl: string): string {
  return new URL(aiosHomeUrl).origin;
}

/** Prefer configured deep link (e.g. /zh/dashboard) as NextAuth callbackUrl. */
export function resolvePortalCallbackUrl(aiosHomeUrl: string): string {
  const parsed = new URL(aiosHomeUrl);
  if (parsed.pathname && parsed.pathname !== "/") {
    return aiosHomeUrl;
  }
  return `${parsed.origin}/dashboard`;
}

function toPersisted(cookie: Cookie): PersistedPortalCookie | null {
  if (!isPortalSessionCookieName(cookie.name)) return null;
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    expirationDate: cookie.expirationDate,
    sameSite: cookie.sameSite,
  };
}

async function readPersistedPortalCookies(): Promise<PersistedPortalCookie[] | null> {
  const keytar = await loadKeytar();
  if (keytar) {
    try {
      const payload = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_PORTAL_ACCOUNT);
      if (payload) {
        return JSON.parse(payload) as PersistedPortalCookie[];
      }
    } catch (err) {
      console.warn("[auth] portal cookie keytar read failed:", err);
    }
  }

  if (safeStorage.isEncryptionAvailable()) {
    const path = PORTAL_COOKIES_FILE();
    if (existsSync(path)) {
      try {
        const plain = safeStorage.decryptString(readFileSync(path));
        return JSON.parse(plain) as PersistedPortalCookie[];
      } catch (err) {
        console.warn("[auth] portal cookie safeStorage read failed:", err);
      }
    }
  }

  return null;
}

async function writePersistedPortalCookies(cookies: PersistedPortalCookie[]): Promise<void> {
  const payload = JSON.stringify(cookies);
  const keytar = await loadKeytar();
  if (keytar) {
    try {
      await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_PORTAL_ACCOUNT, payload);
      return;
    } catch (err) {
      console.warn("[auth] portal cookie keytar write failed:", err);
    }
  }

  if (safeStorage.isEncryptionAvailable()) {
    mkdirSync(dirname(PORTAL_COOKIES_FILE()), { recursive: true });
    writeFileSync(PORTAL_COOKIES_FILE(), safeStorage.encryptString(payload));
  }
}

async function clearPersistedPortalCookies(): Promise<void> {
  const keytar = await loadKeytar();
  if (keytar) {
    try {
      await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_PORTAL_ACCOUNT);
    } catch {
      /* ignore */
    }
  }
  const path = PORTAL_COOKIES_FILE();
  if (existsSync(path)) {
    rmSync(path, { force: true });
  }
}

export async function hasPortalSessionCookie(aiosHomeUrl: string): Promise<boolean> {
  const origin = portalOrigin(aiosHomeUrl);
  const cookies = await aiosHomeSession().cookies.get({ url: origin });
  return cookies.some((c) => isPortalSessionCookieName(c.name));
}

async function capturePortalCookies(aiosHomeUrl: string): Promise<PersistedPortalCookie[]> {
  const origin = portalOrigin(aiosHomeUrl);
  const cookies = await aiosHomeSession().cookies.get({ url: origin });
  return cookies
    .map((c) => toPersisted(c))
    .filter((c): c is PersistedPortalCookie => c !== null);
}

/**
 * Establishes NextAuth session in aios-home partition (Portal pages use cookies, not Bearer).
 * Uses the same email/password as the Desktop login request; password is not stored.
 */
export async function signInPortalWithCredentials(
  aiosHomeUrl: string,
  email: string,
  password: string,
): Promise<boolean> {
  if (!portalBridgeEnabled()) {
    return false;
  }

  const origin = portalOrigin(aiosHomeUrl);
  const ses = aiosHomeSession();

  try {
    const csrfRes = await ses.fetch(`${origin}/api/auth/csrf`);
    if (!csrfRes.ok) {
      console.warn(`[auth] portal csrf failed: ${csrfRes.status}`);
      return false;
    }
    const csrfBody = (await csrfRes.json()) as { csrfToken?: string };
    if (!csrfBody.csrfToken) {
      console.warn("[auth] portal csrf missing csrfToken");
      return false;
    }

    const callbackUrl = resolvePortalCallbackUrl(aiosHomeUrl);
    const body = new URLSearchParams({
      csrfToken: csrfBody.csrfToken,
      email: email.trim(),
      password,
      callbackUrl,
      json: "true",
    });

    const signInRes = await ses.fetch(`${origin}/api/auth/callback/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      redirect: "manual",
    });

    if (signInRes.status >= 400) {
      const text = await signInRes.text().catch(() => "");
      console.warn(`[auth] portal credentials sign-in failed: ${signInRes.status} ${text.slice(0, 200)}`);
      return false;
    }

    const persisted = await capturePortalCookies(aiosHomeUrl);
    if (persisted.length === 0) {
      console.warn("[auth] portal sign-in ok but no session cookies captured");
      return false;
    }

    await writePersistedPortalCookies(persisted);
    console.log(`[auth] Portal session bridged (${persisted.length} cookie(s))`);
    return true;
  } catch (err) {
    console.warn("[auth] portal session bridge error:", err);
    return false;
  }
}

export async function restorePortalSessionCookies(aiosHomeUrl: string): Promise<boolean> {
  if (!portalBridgeEnabled()) {
    return false;
  }

  if (await hasPortalSessionCookie(aiosHomeUrl)) {
    return true;
  }

  const stored = await readPersistedPortalCookies();
  if (!stored?.length) {
    return false;
  }

  const origin = portalOrigin(aiosHomeUrl);
  const ses = aiosHomeSession();

  for (const c of stored) {
    try {
      await ses.cookies.set({
        url: origin,
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path ?? "/",
        secure: c.secure,
        httpOnly: c.httpOnly,
        expirationDate: c.expirationDate,
        sameSite: c.sameSite,
      });
    } catch (err) {
      console.warn(`[auth] failed to restore portal cookie ${c.name}:`, err);
    }
  }

  return hasPortalSessionCookie(aiosHomeUrl);
}

export async function clearPortalSession(aiosHomeUrl?: string): Promise<void> {
  await clearPersistedPortalCookies();

  if (!aiosHomeUrl) {
    return;
  }

  const origin = portalOrigin(aiosHomeUrl);
  const ses = aiosHomeSession();
  const cookies = await ses.cookies.get({ url: origin });
  await Promise.all(
    cookies
      .filter((c) => isPortalSessionCookieName(c.name))
      .map((c) =>
        ses.cookies.remove(origin, c.name).catch(() => {
          /* ignore */
        }),
      ),
  );
}

/**
 * Before loading aios-home: restore persisted NextAuth cookies so embedded pages skip /login.
 */
export async function ensurePortalSessionBeforeAiosHome(
  aiosHomeUrl: string,
): Promise<void> {
  if (!portalBridgeEnabled()) {
    return;
  }
  const restored = await restorePortalSessionCookies(aiosHomeUrl);
  if (restored) {
    console.log("[auth] Portal session cookies restored for aios-home");
  }
}
