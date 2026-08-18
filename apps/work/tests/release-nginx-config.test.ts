import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const RELEASE_SERVER_ROOT = join(REPO_ROOT, "infra", "release-server");
const COMPOSE = readFileSync(join(RELEASE_SERVER_ROOT, "docker-compose.yml"), "utf8");
const NGINX = readFileSync(join(RELEASE_SERVER_ROOT, "nginx", "default.conf"), "utf8");
const README = readFileSync(join(RELEASE_SERVER_ROOT, "README.md"), "utf8");

describe("work v2.1 release server infrastructure", () => {
  it("pins the nginx image and mounts the release data volume read-only", () => {
    expect(COMPOSE).toContain("image: nginx:1.26.3-alpine");
    expect(COMPOSE).toContain("container_name: smc-release-server");
    expect(COMPOSE).toContain("${RELEASE_DATA_ROOT:-/data/smc-release}:/srv/releases:ro");
    expect(COMPOSE).toContain("./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro");
    expect(COMPOSE).toContain("./certs:/etc/nginx/certs:ro");
  });

  it("locks nginx down to HTTPS GET/HEAD traffic", () => {
    expect(NGINX).toContain("listen 443 ssl;");
    expect(NGINX).toContain("server_name _;");
    expect(NGINX).toContain("root /srv/releases;");
    expect(NGINX).toContain("autoindex off;");
    expect(NGINX).toContain("server_tokens off;");
    expect(NGINX).toContain('return 200 "OK\\n";');
    expect(NGINX).toMatch(/location ~\* \/latest\\\.yml\$ \{[\s\S]*limit_except GET HEAD \{[\s\S]*deny all;/);
    expect(NGINX).toMatch(/location ~\* \\\.\(exe\|blockmap\)\$ \{[\s\S]*limit_except GET HEAD \{[\s\S]*deny all;/);
    expect(NGINX).toMatch(/location \/ \{[\s\S]*limit_except GET HEAD \{[\s\S]*deny all;/);
  });

  it("sets separate cache policies for latest.yml and immutable artifacts", () => {
    expect(NGINX).toContain('"no-cache, no-store, must-revalidate"');
    expect(NGINX).toContain('"public, max-age=31536000, immutable"');
  });

  it("documents local-only dev cert generation and keeps certs out of git", () => {
    expect(README).toContain("./scripts/gen-dev-certs.sh");
    expect(README).toContain("not acceptable for production");
    expect(existsSync(join(RELEASE_SERVER_ROOT, "scripts", "gen-dev-certs.sh"))).toBe(true);
    expect(existsSync(join(RELEASE_SERVER_ROOT, "certs", ".gitignore"))).toBe(true);
    expect(readFileSync(join(RELEASE_SERVER_ROOT, "certs", ".gitignore"), "utf8")).toContain(
      "!.gitignore",
    );
  });
});
