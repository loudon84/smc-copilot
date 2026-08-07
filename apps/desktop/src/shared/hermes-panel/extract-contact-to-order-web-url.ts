/** Pick the best callback web_url candidate from assistant markdown/text. */
export function extractContactToOrderWebUrl(content: string): {
  url: string | null;
  looksTruncated: boolean;
} {
  const candidates: string[] = [];

  const webUrlJson = content.match(/"web_url"\s*:\s*"(https?:\/\/[^"]+)"/);
  if (webUrlJson?.[1]) {
    candidates.push(webUrlJson[1].replace(/\\"/g, '"'));
  }

  for (const m of content.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
    if (m[1]) candidates.push(m[1]);
  }

  for (const m of content.matchAll(/https?:\/\/[^\s)\]"']+/g)) {
    if (m[0]?.includes("tempType=")) candidates.push(m[0]);
  }

  const withTempType = candidates.filter((u) => u.includes("tempType="));
  if (withTempType.length === 0) {
    return { url: null, looksTruncated: false };
  }

  const url = withTempType.reduce((a, b) => (a.length >= b.length ? a : b));
  const looksTruncated =
    url.includes("tempType=%7B") &&
    (url.endsWith("%7") ||
      url.endsWith("%") ||
      (!url.includes("%7D") && url.length > 400));

  return { url, looksTruncated };
}
