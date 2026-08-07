/**
 * Append machine-readable JSON for skill CLI args.
 * callbackURL must reach the agent verbatim; do not split or rewrite query params here.
 */

/** Value stops at punctuation — `\S+` wrongly eats `，callbackURL=...` after `issmple=1`. */
const KV_VALUE = String.raw`[^，,;\s]+`;

const URL_VALUE = String.raw`https?:\/\/[^\s\u4e00-\u9fff，。；]+`;

/** One pattern only: `callbackUrl` regex with `/i` would duplicate-match `callbackURL=`. */
const CALLBACK_URL_PATTERN = new RegExp(
  String.raw`\bcallbackUrl\s*=\s*(${URL_VALUE})`,
  "i",
);

const PARAM_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "issmple", pattern: new RegExp(String.raw`\bissmple\s*=\s*(${KV_VALUE})`, "i") },
  { key: "skill", pattern: new RegExp(String.raw`\bskill\s*=\s*(${KV_VALUE})`, "i") },
];

function extractParamsFromMessage(message: string): Record<string, string> {
  const params: Record<string, string> = {};

  const callbackMatch = message.match(CALLBACK_URL_PATTERN);
  if (callbackMatch?.[1]) {
    params.callbackURL = callbackMatch[1];
  }

  for (const { key, pattern } of PARAM_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) {
      params[key] = match[1];
    }
  }

  if (!params.callbackURL) {
    const urlMatch = message.match(new RegExp(String.raw`\b${URL_VALUE}`, "i"));
    if (urlMatch?.[0]) {
      params.pageUrl = urlMatch[0];
    }
  }

  return params;
}

function appendCallbackUrlBuildHint(callbackURL: string): string {
  if (!callbackURL.includes("tempType=")) return "";
  return (
    "\n\n[CallbackURLBuild]\n" +
    "生成可打开链接：finalUrl = callbackURL（SkillParamsJSON，整串原样）+ encodeURIComponent(附件解析得到的 JSON 字符串)。\n" +
    "禁止修改 callbackURL 中的 scheme/host/端口/path 与 method 等已有查询参数；禁止把 192.168.x.x 等 IP 改写为其它数字。\n" +
    "Markdown 与 href 中查询串连接符必须是 ASCII &，禁止 &amp;；禁止对 callbackURL 再做 HTML 实体编码。\n" +
    "contact_to_order 成功时：只输出 [打开订单导入页面](terminal 的 web_url)，勿粘贴裸 URL、勿附 orderinfo JSON。"
  );
}

/** If message contains skill-relevant key=value or URLs, append a JSON block for safe parsing. */
export function appendSkillParamsJsonBlock(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return message;

  const params = extractParamsFromMessage(trimmed);
  if (Object.keys(params).length === 0) return message;

  const hint = params.callbackURL ? appendCallbackUrlBuildHint(params.callbackURL) : "";
  return `${trimmed}\n\n[SkillParamsJSON]\n${JSON.stringify(params, null, 2)}${hint}`;
}

export function formatSkillParamsJson(params: Record<string, string | undefined>): string {
  const cleaned = Object.fromEntries(
    Object.entries(params).filter(([, v]) => typeof v === "string" && v.trim().length > 0),
  ) as Record<string, string>;
  if (Object.keys(cleaned).length === 0) return "";
  return `[SkillParamsJSON]\n${JSON.stringify(cleaned, null, 2)}`;
}
