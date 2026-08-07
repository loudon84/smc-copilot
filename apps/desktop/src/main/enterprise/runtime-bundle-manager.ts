import { existsSync, mkdirSync, createWriteStream, unlinkSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";

import type {
  DeploymentConfig,
  EnterpriseErrorResult,
} from "../../shared/enterprise/enterprise-schema";

import { verifySha256 } from "./checksum-verifier";
import { getHermesBasePath } from "./deployment-config";
import { getDesktopAgentDir } from "./windows/path-resolver";
import { safeExtractZip } from "./command-security-guard";

export interface BundleProgress {
  stage: "downloading" | "verifying" | "extracting" | "skipped" | "completed";
  percent: number;
  message: string;
}

export type BundleProgressCallback = (progress: BundleProgress) => void;

export interface ResolveBundleResult {
  ok: boolean;
  runtimePath?: string;
  agentPath?: string;
  skipped?: boolean;
  errorCode?: string;
  message?: string;
}

function getRuntimePath(): string {
  return getHermesBasePath();
}

async function downloadWithRetry(
  url: string,
  destPath: string,
  onProgress?: BundleProgressCallback,
  maxRetries = 3,
): Promise<void> {
  const partPath = `${destPath}.part`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { redirect: "follow" });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const totalSize = response.headers.get("content-length");
      const totalBytes = totalSize ? parseInt(totalSize, 10) : 0;
      let receivedBytes = 0;

      mkdirSync(dirname(destPath), { recursive: true });

      if (!response.body) {
        throw new Error("Response body is null");
      }

      const writer = createWriteStream(partPath);
      const reader = response.body.getReader();

      let done = false;
      while (!done) {
        const result = await reader.read();
        if (result.done) {
          done = true;
        } else {
          writer.write(Buffer.from(result.value));
          receivedBytes += result.value.length;
          if (totalBytes > 0 && onProgress) {
            onProgress({
              stage: "downloading",
              percent: Math.round((receivedBytes / totalBytes) * 100),
              message: `下载中 ${Math.round(receivedBytes / 1024 / 1024)}MB / ${Math.round(totalBytes / 1024 / 1024)}MB`,
            });
          }
        }
      }

      writer.end();
      renameSync(partPath, destPath);
      return;
    } catch (err) {
      if (existsSync(partPath)) {
        try { unlinkSync(partPath); } catch { /* ignore */ }
      }
      if (attempt === maxRetries) {
        throw err;
      }
      const delayMs = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function extractZip(
  zipPath: string,
  destDir: string,
  onProgress?: BundleProgressCallback,
): Promise<void> {
  mkdirSync(destDir, { recursive: true });

  onProgress?.({
    stage: "extracting",
    percent: 0,
    message: "解压中...",
  });

  if (process.platform === "win32") {
    safeExtractZip(zipPath, destDir, { timeout: 300000 });
  } else {
    execFileSync("unzip", ["-o", zipPath, "-d", destDir], {
      encoding: "utf-8",
      timeout: 300000,
    });
  }

  onProgress?.({
    stage: "extracting",
    percent: 100,
    message: "解压完成",
  });
}

export async function resolveRuntimeBundle(
  config: DeploymentConfig,
  onProgress?: BundleProgressCallback,
  existingBundleHash?: string,
): Promise<ResolveBundleResult> {
  const runtimePath = getRuntimePath();
  const agentPath = getDesktopAgentDir();
  const { runtimeBundle, security } = config;

  if (existingBundleHash && runtimeBundle.bundleSha256 && existingBundleHash === runtimeBundle.bundleSha256) {
    onProgress?.({
      stage: "skipped",
      percent: 100,
      message: "Bundle 已存在且 SHA-256 匹配，跳过下载",
    });
    return { ok: true, runtimePath, agentPath, skipped: true };
  }

  let bundleFilePath = "";

  switch (runtimeBundle.sourceType) {
    case "artifact": {
      if (!runtimeBundle.bundleUrl) {
        return { ok: false, errorCode: "E_BUNDLE_DOWNLOAD_FAILED", message: "sourceType=artifact 但 bundleUrl 为空" };
      }

      const cacheDir = join(getHermesBasePath(), "cache", "downloads");
      mkdirSync(cacheDir, { recursive: true });
      bundleFilePath = join(cacheDir, "hermes-runtime-bundle.zip");

      onProgress?.({ stage: "downloading", percent: 0, message: "开始下载 Runtime Bundle..." });

      try {
        await downloadWithRetry(runtimeBundle.bundleUrl, bundleFilePath, onProgress);
      } catch (err) {
        return {
          ok: false,
          errorCode: "E_BUNDLE_DOWNLOAD_FAILED",
          message: `下载失败: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      break;
    }

    case "offline": {
      bundleFilePath = runtimeBundle.offlineBundlePath;
      if (!bundleFilePath || !existsSync(bundleFilePath)) {
        return { ok: false, errorCode: "E_BUNDLE_DOWNLOAD_FAILED", message: "离线 Bundle 路径不存在" };
      }
      break;
    }

    case "embedded": {
      bundleFilePath = join(process.resourcesPath || "", "hermes-runtime-bundle.zip");
      if (!existsSync(bundleFilePath)) {
        return { ok: false, errorCode: "E_BUNDLE_DOWNLOAD_FAILED", message: "内嵌 Bundle 不存在" };
      }
      break;
    }
  }

  if (security.verifyBundleSha256 && runtimeBundle.bundleSha256) {
    onProgress?.({ stage: "verifying", percent: 0, message: "校验 SHA-256..." });

    const shaResult = await verifySha256(bundleFilePath, runtimeBundle.bundleSha256);
    if (!shaResult.ok) {
      return {
        ok: false,
        errorCode: "E_BUNDLE_SHA256_MISMATCH",
        message: `SHA-256 校验失败: 期望 ${runtimeBundle.bundleSha256}, 实际 ${shaResult.actualHash}`,
      };
    }

    onProgress?.({ stage: "verifying", percent: 100, message: "SHA-256 校验通过" });
  }

  const extractDir = join(getHermesBasePath(), "cache", "extracted");
  try {
    await extractZip(bundleFilePath, extractDir, onProgress);
  } catch (err) {
    return {
      ok: false,
      errorCode: "E_BUNDLE_EXTRACT_FAILED",
      message: `解压失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  onProgress?.({ stage: "completed", percent: 100, message: "Runtime Bundle 准备完成" });

  return { ok: true, runtimePath, agentPath };
}
