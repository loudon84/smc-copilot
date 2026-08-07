import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { profileHome } from "./utils";

const REL_PATH = join("skills", "contact_to_order", ".run", "last_web_url.txt");

export function contactToOrderLastWebUrlPath(profile?: string): string {
  return join(profileHome(profile), REL_PATH);
}

/** Full callback URL written by contact_to_order extract_text.py (avoids terminal truncation). */
export function readContactToOrderLastWebUrl(profile?: string): {
  url: string;
  path: string;
} | null {
  const path = contactToOrderLastWebUrlPath(profile);
  if (!existsSync(path)) return null;
  const url = readFileSync(path, "utf-8").trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
  return { url, path };
}
