import { existsSync } from "node:fs";
import type { DoctorCheckResult } from "../../../shared/enterprise/enterprise-schema";

export function checkAgentFiles(agentPath: string): DoctorCheckResult {
  const start = Date.now();
  const criticalFiles = [
    "hermes",
    "hermes/__main__.py",
    "requirements.txt",
    "pyproject.toml",
  ];

  const missing: string[] = [];
  for (const file of criticalFiles) {
    if (!existsSync(`${agentPath}/${file}`)) {
      missing.push(file);
    }
  }

  return {
    id: "agent-files",
    name: "Agent 文件完整性",
    status: missing.length === 0 ? "pass" : "fail",
    message: missing.length === 0 ? "核心文件完整" : `缺失文件: ${missing.join(", ")}`,
    durationMs: Date.now() - start,
  };
}
