import { execFileSync } from "child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import {
  HERMES_HOME,
  getHermesPython,
  getHermesScript,
  getHermesRepo,
  getEnhancedPath,
} from "./installer";
import { profileHome } from "./utils";

export interface InstalledSkill {
  name: string;
  category: string;
  description: string;
  path: string;
}

export interface SkillSearchResult {
  name: string;
  description: string;
  category: string;
  source: string;
  installed: boolean;
}

/**
 * Parse SKILL.md frontmatter (YAML between --- markers) for name/description.
 */
function parseSkillFrontmatter(content: string): {
  name: string;
  description: string;
} {
  const result = { name: "", description: "" };

  // Check for YAML frontmatter
  if (!content.startsWith("---")) {
    // Fall back to first heading and first paragraph
    const headingMatch = content.match(/^#\s+(.+)/m);
    if (headingMatch) result.name = headingMatch[1].trim();
    const paraMatch = content.match(/^(?!#)(?!---).+/m);
    if (paraMatch) result.description = paraMatch[0].trim().slice(0, 120);
    return result;
  }

  const endIdx = content.indexOf("---", 3);
  if (endIdx === -1) return result;

  const frontmatter = content.slice(3, endIdx);

  const nameMatch = frontmatter.match(/^\s*name:\s*["']?([^"'\n]+)["']?\s*$/m);
  if (nameMatch) result.name = nameMatch[1].trim();

  const descMatch = frontmatter.match(
    /^\s*description:\s*["']?([^"'\n]+)["']?\s*$/m,
  );
  if (descMatch) result.description = descMatch[1].trim();

  return result;
}

function appendInstalledSkill(
  skills: InstalledSkill[],
  input: { skillDir: string; folderName: string; category: string },
): void {
  const skillFile = join(input.skillDir, "SKILL.md");
  if (!existsSync(skillFile)) return;

  try {
    const content = readFileSync(skillFile, "utf-8").slice(0, 4000);
    const meta = parseSkillFrontmatter(content);
    skills.push({
      name: meta.name || input.folderName,
      category: input.category,
      description: meta.description || "",
      path: input.skillDir,
    });
  } catch {
    skills.push({
      name: input.folderName,
      category: input.category,
      description: "",
      path: input.skillDir,
    });
  }
}

/**
 * Walk the skills directory to find all installed skills.
 *
 * Supported layouts:
 * - `skills/<skill-name>/SKILL.md` (flat, e.g. contact_to_order)
 * - `skills/<category>/<skill-name>/SKILL.md` (categorized)
 */
export function listInstalledSkills(profile?: string): InstalledSkill[] {
  const skillsDir = join(profileHome(profile), "skills");
  if (!existsSync(skillsDir)) return [];
  
  const skills: InstalledSkill[] = [];

  try {
    const topEntries = readdirSync(skillsDir);

    for (const topName of topEntries) {
      const topPath = join(skillsDir, topName);
      if (!statSync(topPath).isDirectory()) continue;

      const directSkillFile = join(topPath, "SKILL.md");
      if (existsSync(directSkillFile)) {
        appendInstalledSkill(skills, {
          skillDir: topPath,
          folderName: topName,
          category: "",
        });
        continue;
      }

      const nested = readdirSync(topPath);
      for (const skillFolder of nested) {
        const skillDir = join(topPath, skillFolder);
        if (!statSync(skillDir).isDirectory()) continue;
        appendInstalledSkill(skills, {
          skillDir,
          folderName: skillFolder,
          category: topName,
        });
      }
    }
  } catch {
    // ignore
  }

  return skills.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
}

/**
 * Get the full content of a SKILL.md for the detail view.
 */
export function getSkillContent(skillPath: string): string {
  const skillFile = join(skillPath, "SKILL.md");
  if (!existsSync(skillFile)) return "";

  try {
    return readFileSync(skillFile, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Search the skill registry via the hermes CLI.
 */
export function searchSkills(query: string): SkillSearchResult[] {
  try {
    const output = execFileSync(
      getHermesPython(),
      [getHermesScript(), "skills", "browse", "--query", query, "--json"],
      {
        cwd: getHermesRepo(),
        env: {
          ...process.env,
          PATH: getEnhancedPath(),
          HOME: homedir(),
          HERMES_HOME,
        },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30000,
      },
    );

    const text = output.toString().trim();
    if (!text) return [];

    // Try to parse JSON output
    try {
      const results = JSON.parse(text);
      if (Array.isArray(results)) {
        return results.map((r: Record<string, string>) => ({
          name: r.name || "",
          description: r.description || "",
          category: r.category || "",
          source: r.source || "",
          installed: false,
        }));
      }
    } catch {
      // If JSON parsing fails, the CLI may not support --json flag
      // Fall back to listing bundled skills that match
    }

    return [];
  } catch {
    return [];
  }
}

/**
 * List bundled skills from the hermes-agent repo.
 */
export function listBundledSkills(): SkillSearchResult[] {
  const bundledDir = join(getHermesRepo(), "skills");
  if (!existsSync(bundledDir)) return [];

  const skills: SkillSearchResult[] = [];

  try {
    const categories = readdirSync(bundledDir);

    for (const category of categories) {
      const catPath = join(bundledDir, category);
      if (!statSync(catPath).isDirectory()) continue;

      const entries = readdirSync(catPath);
      for (const entry of entries) {
        const entryPath = join(catPath, entry);
        if (!statSync(entryPath).isDirectory()) continue;

        const skillFile = join(entryPath, "SKILL.md");
        if (!existsSync(skillFile)) continue;

        try {
          const content = readFileSync(skillFile, "utf-8").slice(0, 4000);
          const meta = parseSkillFrontmatter(content);

          skills.push({
            name: meta.name || entry,
            description: meta.description || "",
            category,
            source: "bundled",
            installed: false,
          });
        } catch {
          skills.push({
            name: entry,
            description: "",
            category,
            source: "bundled",
            installed: false,
          });
        }
      }
    }
  } catch {
    // ignore
  }

  return skills.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
}

export function installSkill(
  identifier: string,
  profile?: string,
): { success: boolean; error?: string } {
  try {
    const args = [getHermesScript(), "skills", "install", identifier, "--yes"];
    if (profile && profile !== "default") {
      args.splice(1, 0, "-p", profile);
    }

    execFileSync(getHermesPython(), args, {
      cwd: getHermesRepo(),
      env: {
        ...process.env,
        PATH: getEnhancedPath(),
        HOME: homedir(),
        HERMES_HOME,
      },
      stdio: "pipe",
      timeout: 60000,
    });
    return { success: true };
  } catch (err) {
    const msg =
      (err as { stderr?: Buffer }).stderr?.toString() || (err as Error).message;
    return { success: false, error: msg.trim() };
  }
}

export function uninstallSkill(
  name: string,
  profile?: string,
): { success: boolean; error?: string } {
  try {
    const args = [getHermesScript(), "skills", "uninstall", name];
    if (profile && profile !== "default") {
      args.splice(1, 0, "-p", profile);
    }

    execFileSync(getHermesPython(), args, {
      cwd: getHermesRepo(),
      env: {
        ...process.env,
        PATH: getEnhancedPath(),
        HOME: homedir(),
        HERMES_HOME,
      },
      stdio: "pipe",
      timeout: 30000,
    });
    return { success: true };
  } catch (err) {
    const msg =
      (err as { stderr?: Buffer }).stderr?.toString() || (err as Error).message;
    return { success: false, error: msg.trim() };
  }
}
