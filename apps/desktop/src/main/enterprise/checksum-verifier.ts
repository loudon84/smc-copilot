import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { EnterpriseErrorResult } from "../../shared/enterprise/enterprise-schema";

export interface Sha256Result {
  ok: boolean;
  actualHash?: string;
  error?: string;
}

export function verifySha256(filePath: string, expectedHash: string): Promise<Sha256Result> {
  return new Promise((resolve) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("data", (chunk: string | Buffer) => {
      hash.update(chunk);
    });

    stream.on("end", () => {
      const actualHash = hash.digest("hex");
      resolve({
        ok: actualHash === expectedHash,
        actualHash,
      });
    });

    stream.on("error", (err) => {
      resolve({
        ok: false,
        error: `SHA-256 计算失败: ${err.message}`,
      });
    });
  });
}

export interface SignatureResult {
  ok: boolean;
  error?: string;
}

export async function verifyManifestSignature(
  _manifestPath: string,
): Promise<SignatureResult | EnterpriseErrorResult> {
  return { ok: true };
}
