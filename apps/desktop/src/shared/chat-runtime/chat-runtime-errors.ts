/** v8.0 Chat Runtime — error codes. */

export const ChatRuntimeErrorCode = {
  INVALID_INPUT: "CHAT_RUNTIME_INVALID_INPUT",
  RUN_NOT_FOUND: "CHAT_RUNTIME_RUN_NOT_FOUND",
  RUN_ALREADY_ACTIVE: "CHAT_RUNTIME_RUN_ALREADY_ACTIVE",
  EXPERT_BLOCKED: "CHAT_RUNTIME_EXPERT_BLOCKED",
  GATEWAY_UNAVAILABLE: "CHAT_RUNTIME_GATEWAY_UNAVAILABLE",
  RUNTIME_UNAVAILABLE: "RUNTIME_UNAVAILABLE",
  SEND_FAILED: "CHAT_RUNTIME_SEND_FAILED",
  CANCELLED: "CHAT_RUNTIME_CANCELLED",
  SENDER_GONE: "CHAT_RUNTIME_SENDER_GONE",
} as const;

export type ChatRuntimeErrorCode =
  (typeof ChatRuntimeErrorCode)[keyof typeof ChatRuntimeErrorCode];

export function chatRuntimeError(
  code: ChatRuntimeErrorCode,
  message: string,
): { code: string; message: string } {
  return { code, message };
}
