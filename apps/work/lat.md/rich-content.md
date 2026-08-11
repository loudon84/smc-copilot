# Rich Content

Agent message rich blocks: GFM markdown plus routed Mermaid, SVG, and HTML artifact fences, extracted from AgentMarkdown into [[src/renderer/src/components/rich-content/RichContentRenderer.tsx#RichContentRenderer]].

## Renderer

[[src/renderer/src/components/rich-content/RichContentRenderer.tsx#RichContentRenderer]] is the shared markdown surface for chat, Discover, Skills, and file markdown preview.

[[src/renderer/src/components/AgentMarkdown.tsx#AgentMarkdown]] stays a thin `children` → `content` wrapper so existing call sites keep working. GFM markdown rendering lives under `markdown/` ([[src/renderer/src/components/rich-content/markdown/MarkdownRenderer.tsx#MarkdownRenderer]] with [[src/renderer/src/components/rich-content/markdown/MarkdownCode.tsx#MarkdownCode]] routing). Fenced code is routed by language: `mermaid` → MermaidBlock, `svg` → SvgBlock, `html` → ArtifactBlock, `diff`/default → CodeBlock (DiffView, box-diagram plain path, collapse — see [[code-blocks]]).

## Streaming fences stay inert

While a message streams, an unclosed fence must not run Mermaid or mount SVG/HTML.

[[src/renderer/src/components/rich-content/stream-fence.ts#isFenceClosed]] inspects the node's source slice for a trailing backtick fence line; incomplete fences render as source/CodeBlock instead.

[[src/renderer/src/components/AgentMarkdown.tsx#AgentMarkdown]] accepts optional `streaming` and forwards it to RichContentRenderer. [[src/renderer/src/screens/Chat/MessageRow.tsx#MessageRow]] passes `streaming={isLoading && isLast}` so only the tail in-flight agent bubble stays inert; history and non-last rows stay `false`.

## E2E scenarios

Vitest covers PRD §26 core asserts with synthetic `tests/fixtures/files` (not Playwright Electron).

### E2E-01 text import

TXT fixture import → parse → `toHermesAttachment` / preview descriptor are reachable.

### E2E-02 pdf path-ref

PDF local adapter emits path-ref; remote without parsed text rejects and never leaks path; parse does not throw.

### E2E-03 image dataUrl

PNG staging/import → attachment includes a `data:` URL.

### E2E-04 corrupt docx

Corrupt DOCX still allows local path-ref; `retryParse` returns a result without crashing.

### E2E-05 streaming mermaid

`streaming=true` with an unclosed mermaid fence must not call `mermaid.render`.

### E2E-06 streaming artifact

Artifact `streaming=true` shows source only: no iframe, Preview control disabled.

### E2E-07 remote no path

`toHermesAttachment(..., { mode: "remote" })` for office/pdf never includes `path`.

## Mermaid

[[src/renderer/src/components/rich-content/MermaidBlock.tsx#MermaidBlock]] lazy-imports `mermaid` with `securityLevel: "strict"` (no arbitrary script injection via config).

It debounces render and falls back to CodeBlock on error. Copy source and export SVG are available once a diagram is ready.

## SVG sanitize strips scripts

[[src/renderer/src/components/rich-content/sanitize-svg.ts#sanitizeSvg]] runs DOMPurify (SVG profile) before SvgBlock mounts markup.

It strips `script`/`foreignObject`, `on*` handlers, and external/`javascript:` hrefs. Source/preview toggle and export are supported.

## Artifact sandbox

[[src/renderer/src/components/rich-content/ArtifactBlock.tsx#ArtifactBlock]] / [[src/renderer/src/components/rich-content/ArtifactFrame.tsx#ArtifactFrame]] preview HTML without `allow-same-origin`.

Main registers `hermes-artifact://` via [[src/main/artifact-protocol.ts#registerArtifactProtocolHandler]]; the iframe prefers that host and falls back to inlined `srcDoc` from [[src/renderer/src/components/rich-content/artifact-host.ts#buildArtifactHostSrcDoc]]. Content arrives via postMessage on channel `hermes-artifact` with fixed origin allow-list checks.

## Artifact AST combiner

[[src/renderer/src/components/rich-content/artifact-source-parser.ts#combineArtifactFences]] merges html/css/js fences into one CSP-bearing document. [[src/renderer/src/components/rich-content/merge-artifact-fences.ts#mergeAdjacentArtifactFences]] rewrites adjacent fences before Markdown routes a single ArtifactBlock.

## Electron UI smoke

Optional CDP smoke via `npm run test:e2e-prd-smoke` (see `scripts/README.md`). Covers attach affordance and artifact iframe opacity when Electron runs with `ENABLE_CDP=1`; exits cleanly when CDP is down.
