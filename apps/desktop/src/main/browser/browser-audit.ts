import { createWriteStream, readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type {
  BrowserAuditRecord,
  BrowserActionSource,
  BrowserActionName,
  BrowserActionStatus,
  BrowserErrorCode
} from "../../shared/browser/browser-contract";
import { randomUUID } from "crypto";

export class BrowserAuditLogger {
  private logDir: string;
  private currentDate: string = "";
  private writeStream: ReturnType<typeof createWriteStream> | null = null;
  private logListeners: Array<(record: BrowserAuditRecord) => void> = [];

  constructor(logDir: string) {
    this.logDir = logDir;
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
  }

  private getTodayDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private getCurrentLogPath(): string {
    return join(this.logDir, `browser-audit-${this.currentDate}.jsonl`);
  }

  private ensureStream(): void {
    const today = this.getTodayDate();
    if (today !== this.currentDate) {
      if (this.writeStream) {
        this.writeStream.end();
        this.writeStream = null;
      }
      this.currentDate = today;
    }
    if (!this.writeStream) {
      const filePath = this.getCurrentLogPath();
      if (!existsSync(dirname(filePath))) {
        mkdirSync(dirname(filePath), { recursive: true });
      }
      this.writeStream = createWriteStream(filePath, { flags: "a" });
    }
  }

  log(params: {
    source: BrowserActionSource;
    action: BrowserActionName;
    url?: string;
    argsSummary?: Record<string, unknown>;
    status: BrowserActionStatus;
    errorCode?: BrowserErrorCode;
    message?: string;
    profile?: string;
  }): BrowserAuditRecord {
    const record: BrowserAuditRecord = {
      id: randomUUID(),
      time: new Date().toISOString(),
      profile: params.profile,
      source: params.source,
      action: params.action,
      url: params.url,
      argsSummary: params.argsSummary,
      status: params.status,
      errorCode: params.errorCode,
      message: params.message
    };

    this.ensureStream();
    this.writeStream!.write(JSON.stringify(record) + "\n");

    for (const listener of this.logListeners) {
      try {
        listener(record);
      } catch {}
    }

    return record;
  }

  sanitizeTypeArgs(text: string): { textLength: number } {
    return { textLength: text.length };
  }

  query(limit?: number): BrowserAuditRecord[] {
    const filePath = this.getCurrentLogPath();
    if (!existsSync(filePath)) return [];

    const raw = readFileSync(filePath, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const records = lines.map((line) => {
      try {
        return JSON.parse(line) as BrowserAuditRecord;
      } catch {
        return null;
      }
    }).filter((r): r is BrowserAuditRecord => r !== null);

    if (limit && limit > 0) {
      return records.slice(-limit);
    }
    return records;
  }

  onLog(listener: (record: BrowserAuditRecord) => void): () => void {
    this.logListeners.push(listener);
    return () => {
      const idx = this.logListeners.indexOf(listener);
      if (idx >= 0) this.logListeners.splice(idx, 1);
    };
  }

  close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
    this.logListeners = [];
  }

  getLogDir(): string {
    return this.logDir;
  }
}
