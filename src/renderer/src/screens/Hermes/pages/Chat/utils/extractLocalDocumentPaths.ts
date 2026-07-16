const LOCAL_PATH_PATTERNS = [
  /file:\/\/[^\s<>"']+/gi,
  /(?:~\/\.hermes\/[^\s<>"']+)/gi,
  /(?:\.hermes\/workspace\/[^\s<>"']+)/gi,
  /(?:[A-Za-z]:\\[^\s<>"']+)/g,
  /(?:\/(?:Users|home|tmp|var)[^\s<>"']+)/g,
];

export type LocalDocumentRef = {
  path: string;
  fileName: string;
  fileType?: string;
};

function normalizePath(raw: string): string {
  return raw.replace(/[),.;]+$/g, "").trim();
}

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/^file:\/\//i, "");
  const parts = normalized.split(/[/\\]/);
  return parts[parts.length - 1] || normalized;
}

function fileTypeFromPath(path: string): string | undefined {
  const fileName = fileNameFromPath(path);
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return undefined;
  return fileName.slice(dot + 1).toLowerCase();
}

export function extractLocalDocumentPaths(content: string): LocalDocumentRef[] {
  const found = new Set<string>();
  const results: LocalDocumentRef[] = [];

  for (const pattern of LOCAL_PATH_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const path = normalizePath(match[0]);
      if (!path || found.has(path)) continue;
      found.add(path);
      results.push({
        path,
        fileName: fileNameFromPath(path),
        fileType: fileTypeFromPath(path),
      });
    }
  }

  return results;
}

export function stripLocalDocumentPaths(content: string, paths: LocalDocumentRef[]): string {
  let next = content;
  for (const ref of paths) {
    next = next.split(ref.path).join("");
  }
  return next.replace(/\n{3,}/g, "\n\n").trim();
}
