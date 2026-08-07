import { randomUUID } from "crypto";
import type {
  BrowserActionLogEntry,
  BrowserActionType,
  BrowserStructuredActionResult,
} from "../../shared/browser/browser-action-contract";

const MAX_LOGS = 500;

export class BrowserActionLogStore {
  private logs: BrowserActionLogEntry[] = [];
  private listeners: Array<(log: BrowserActionLogEntry) => void> = [];

  append(
    action: BrowserActionType,
    params: unknown,
    result: BrowserStructuredActionResult,
  ): BrowserActionLogEntry {
    const entry: BrowserActionLogEntry = {
      id: randomUUID(),
      action,
      params,
      result,
      createdAt: new Date().toISOString(),
    };
    this.logs.push(entry);
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(-MAX_LOGS);
    }
    for (const listener of this.listeners) {
      listener(entry);
    }
    return entry;
  }

  getAll(limit = 100): BrowserActionLogEntry[] {
    if (limit <= 0) return [];
    return this.logs.slice(-limit);
  }

  clear(): void {
    this.logs = [];
  }

  onLogged(callback: (log: BrowserActionLogEntry) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }
}
