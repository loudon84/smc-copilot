#!/usr/bin/env node
/**
 * PRD v1.5.4 §H — production Serve-preferred Chat path must not call legacy Hermes sendMessage.
 *
 * We assert ServeChatRuntimeAdapter is preferred first and legacy branch is marked deprecated.
 * Full physical deletion is deferred; this guard prevents re-introducing auto-fallback.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ipc = join(process.cwd(), "src", "main", "chat-runtime", "chat-runtime-ipc.ts");
const adapter = join(
  process.cwd(),
  "src",
  "main",
  "runtime-adapters",
  "ServeChatRuntimeAdapter.ts",
);

const ipcText = readFileSync(ipc, "utf8");
const adapterText = readFileSync(adapter, "utf8");

let failed = false;

if (!ipcText.includes("ServeChatRuntimeAdapter.preferred()")) {
  console.error(
    "[check:desktop-chat-runtime-only] chat-runtime-ipc must gate on ServeChatRuntimeAdapter.preferred()",
  );
  failed = true;
}

if (!ipcText.includes("@deprecated legacy-direct")) {
  console.error(
    "[check:desktop-chat-runtime-only] legacy Hermes branch must be marked @deprecated legacy-direct",
  );
  failed = true;
}

if (!adapterText.includes("chatReady") && !adapterText.includes("isRuntimeChatReady")) {
  console.error(
    "[check:desktop-chat-runtime-only] ServeChatRuntimeAdapter.ready must consider chatReady",
  );
  failed = true;
}

// Prefer Serve must not silently fall back when preferred — beginChatTurn returns Serve path first.
const beginIdx = ipcText.indexOf("async function beginChatTurn");
if (beginIdx < 0) {
  console.error("[check:desktop-chat-runtime-only] beginChatTurn not found");
  failed = true;
} else {
  const slice = ipcText.slice(beginIdx, beginIdx + 2500);
  const preferIdx = slice.indexOf("ServeChatRuntimeAdapter.preferred()");
  const returnServeIdx = slice.indexOf("ServeChatRuntimeAdapter.startTurn");
  if (preferIdx < 0 || returnServeIdx < 0 || preferIdx > returnServeIdx) {
    console.error(
      "[check:desktop-chat-runtime-only] beginChatTurn must prefer ServeChatRuntimeAdapter.startTurn",
    );
    failed = true;
  }
  if (/chatReady\s*\|\|\s*connection\.ready/.test(slice)) {
    console.error(
      "[check:desktop-chat-runtime-only] beginChatTurn must not fall back chatReady || connection.ready",
    );
    failed = true;
  }
  if (!slice.includes("ServeChatRuntimeAdapter.ready")) {
    console.error(
      "[check:desktop-chat-runtime-only] beginChatTurn must gate on ServeChatRuntimeAdapter.ready",
    );
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("[check:desktop-chat-runtime-only] ok");
