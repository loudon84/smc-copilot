---
work_item_id: WORK-PRD-v3.1
version: 3.1.1
status: APPROVED
target_branch: work/prd-3.0
review_verdict: PASS
approved_at: 2026-08-25T18:12:54.7622222+08:00
---

# Work PRD v3.1 — Expert Remote Artifact & Chat File Resource

## 1. Problem and Outcome

Expert execution already returns artifact identities and Work already has a Main-owned File Platform, Session Files UI, `agent-output` associations, preview panel, local Save As, and a guarded Expert artifact transfer path. The missing product capability is to retain an Expert artifact as a server-governed remote resource and use it in Chat, Session Files, preview, explicit download, and on-demand context materialization without downloading it automatically.

The target outcome is:

```text
authoritative task completion
  -> asynchronous artifact metadata discovery
  -> persistent remote File Platform resource + originating-session association
  -> Chat artifact card and Session Files / Agent output
  -> on-demand preview, explicit Download, or internal Materialize
```

Task success remains authoritative even when artifact discovery or later artifact transfer fails.

## 2. Scope

In scope:

- Expert artifact metadata discovery after authoritative task completion;
- a local/remote resource variant within the existing File Platform owner;
- durable remote references and idempotent Session File associations;
- Chat and Session Files presentation of Expert artifacts;
- Main-mediated remote preview and preview-cache lifecycle;
- explicit user Download and internal Materialize;
- on-demand use of a remote artifact as session context;
- restart, offline, 403, 404, integrity, filename, and size-limit behaviour;
- preservation of existing local file behaviour.

Out of scope:

- changing NoDeskClaw artifact production or storage;
- provider release, deployment, or CI audits beyond the contract fields consumed here;
- online artifact editing, collaboration, version control, knowledge-base ingestion, or workspace cloud sync;
- automatic materialization of every Expert artifact;
- generalizing Email, Knowledge, AutoTask, RPA, or cloud-drive providers in this delivery;
- replacing Hermes Agent file tools or the existing Work File Platform.

## 3. Architecture and Trust Boundaries

### 3.1 Unique production owners

| Capability | Target production owner | Boundary |
|---|---|---|
| Expert task lifecycle and completion | Existing Expert Run Service | Owns task state, SSE/poll recovery, result summary, and artifact-discovery lifecycle; binary lifecycle is not owned here. |
| Expert HTTP authentication and provider transport | Existing Expert Gateway Client in Main | Owns backend base URL, JWT, same-origin enforcement, metadata/preview/download requests, and provider error mapping. |
| File resource identity, persistence, associations, preview orchestration, operations, cache, and materialization | Existing Work File Platform in Main | Extends the current Managed File domain; no parallel ArtifactService or artifact database is introduced. |
| Renderer access | Existing narrow preload APIs | Renderer uses resource IDs and renderer-safe metadata only. It never receives JWT, backend base URL, provider preview URL, or provider download URL. |
| Chat, Session Files, and File Preview presentation | Existing renderer file UI | All views consume the same renderer-safe File Platform resource view. |

### 3.2 Resource invariants

1. A remote Expert artifact is a durable server reference, not a local path.
2. Preview cache is transient application data and never changes a remote resource into a local file.
3. Download creates a user-owned copy and does not change or replace the remote session resource.
4. Materialize creates application-managed content backing for the same remote File Platform resource identity. It does not create a second Session resource, erase the remote reference, or change server-governed availability.
5. Distinct server artifact identities must not be collapsed merely because their content hashes match. Content-hash dedup remains valid for local managed bytes, while remote identity is provider plus artifact identity.
6. Session associations are idempotent for the same profile, session, resource, and role.
7. Binary content is never stored in `state.db`, `sessions.json`, Expert projection persistence, or renderer state.

## Current Capability Inventory

| Capability | Existing Owner | Current Behaviour | Evidence | Result |
|---|---|---|---|---|
| Expert provider contract identity | Work Expert shared DTO plus consumer lock | Pins `WORK-EXPERT-CONTRACT v1.0.2`; the provider tag/commit supplies the authoritative OpenAPI and fixtures. The current Work DTO includes core artifact identity, filename, MIME, size, hash, and nullable locators but does not yet normalize the full Preview capability into the File Platform view. | `contracts/work-expert/v1.0.2/consumer-lock.json`; `apps/work/src/shared/expert.ts#ExpertArtifactDescriptor` | PARTIAL |
| Authenticated artifact metadata transport | Expert Gateway Client | Main already lists task artifacts through an authenticated same-origin request. | `apps/work/src/main/expert/expert-gateway-client.ts#ExpertGatewayClient`; `apps/work/src/main/expert/expert-gateway-client.ts#createExpertGatewayClient` | EXISTS |
| Completion and artifact discovery | Expert Run Service | The completion path attempts `listArtifacts` but projects only artifact IDs and suppresses metadata errors. Terminal projection updates set `terminalConfirmed` before the subsequent confirmation call, so the current finalization path does not reliably resolve artifacts. | `apps/work/src/main/expert/expert-run-service.ts#updateProjection`; `apps/work/src/main/expert/expert-run-service.ts#confirmTerminal` | PARTIAL |
| Expert projection and restart continuation | Expert shared DTO and continuation store | Live projection carries `artifactIds`; terminal continuation is removed and no durable artifact metadata is restored through it. | `apps/work/src/shared/expert.ts#ExpertRunProjection`; `apps/work/src/main/expert/expert-continuation.ts#projectionToContinuationItem` | PARTIAL |
| Main-only artifact transfer | Expert artifact download module | Accepts artifact/task IDs, re-reads metadata, enforces same-origin auth, size/MIME guards, sanitized filename, temp write, and atomic temp commit into managed storage. It materializes immediately, does not compare the downloaded hash with provider `sha256`, and inserts a new association without an artifact-identity idempotency owner. | `apps/work/src/main/expert/expert-artifact-download.ts#downloadExpertArtifact` | PARTIAL |
| File domain and persistence | Work File Platform | `ManagedFile`, `file-index.db`, and associations are the production file owner, but each previewable record currently requires a local `managedPath` or `originalPath`; there is no durable provider/artifact identity or remote availability state. | `apps/work/src/shared/files/managed-file.ts#ManagedFile`; `apps/work/src/main/files/file-association-store.ts` | PARTIAL |
| Session Files and Agent output | File associations plus Session Files UI | `agent-output` is an existing role and dedicated UI section. Current cards assume a local managed file and expose local Preview, Save As, Open, and Reveal actions. | `apps/work/src/shared/files/file-association.ts#FileAssociationRole`; `apps/work/src/renderer/src/screens/Chat/session-files/AgentOutputSection.tsx#AgentOutputSection` | PARTIAL |
| File preview | File Platform preview service and File Preview Panel | Renderer opens preview by `fileId`; Main returns renderer-safe descriptors. Main currently fails when no local path exists. | `apps/work/src/main/files/file-preview-service.ts#getPreviewDescriptor`; `apps/work/src/renderer/src/hooks/files/useFilePreview.ts#useFilePreview`; `apps/work/src/renderer/src/components/files/preview/FilePreviewPanel.tsx#FilePreviewPanel` | PARTIAL |
| Session context | File Platform associations and context builder | `context-file` association and ephemeral context injection already exist, but parsing and context assembly require local managed bytes. | `apps/work/src/main/files/file-service.ts#fileService`; `apps/work/src/main/files/file-context-builder.ts#buildSessionFileContext` | PARTIAL |
| Chat artifact card | Chat message presentation | Expert messages show task progress and result content; no production renderer consumes `artifactIds` or `expert.downloadArtifact`. | `apps/work/src/renderer/src/screens/Chat/Chat.tsx`; production search for `artifactIds` and `downloadArtifact` | MISSING |
| File temp cleanup | File Platform cleanup service | Existing cleanup removes old `temp/` files and orphan local objects, but has no remote-preview authorization/invalidation semantics. | `apps/work/src/main/files/file-cleanup-service.ts#cleanupTempFiles` | PARTIAL |

## Target End-State Inventory

| Capability | Target Owner | Target Behaviour | Classification |
|---|---|---|---|
| Expert task result | Expert Run Service | Result summary becomes visible as soon as task completion is authoritative. Artifact discovery starts asynchronously and cannot change a completed task into failed. | MODIFY |
| Artifact discovery projection | Expert Run Service plus File Platform | Projection exposes artifact discovery state and renderer-safe resource references for live UI. Durable resource metadata is written to File Platform, not to chat message content or continuation blobs. | MODIFY |
| Expert remote provider binding | File Platform using Expert Gateway Client transport | Resolves metadata, preview, and transfer by provider plus artifact identity. The binding is an implementation under the existing two owners, not a new service owner. | ADD |
| Unified file resource record | Existing Managed File domain | Represents local resources and remote Expert artifacts without requiring a local path. Remote records retain provider identity, task origin, immutable artifact identity, server metadata, and availability; locators and credentials remain Main-only and are not persisted as renderer-facing truth. | MODIFY |
| Durable session membership | Existing File association store | On successful discovery, every valid artifact is automatically associated once with the originating session as `agent-output`, including task/message origin. Restart renders from this durable reference without network fetch or download. | MODIFY |
| Chat artifact presentation | Existing Chat/file UI | The assistant result presents one card per discovered artifact with name, type, size, availability, Preview, Download, Add to Context, and an `Added` session state. Metadata failure is shown beside artifacts while result content remains successful. | ADD |
| Session Files Agent output | Existing Session Files UI | Lists local and remote resource views in the same section. Remote resources do not expose Open or Reveal until internal materialized backing exists. | MODIFY |
| Remote preview | Existing `files.getPreview` and File Preview Panel | Renderer continues to open by `fileId` and consumes Main-normalized `canPreview`. Main uses Provider Preview JSON for supported text content and may use authorized Download bytes for supported binary/rich client preview cache after an explicit Preview action. Unsupported preview is disabled or returns an explicit unsupported descriptor; 403/404 and retryable network failures remain resource errors. | MODIFY |
| Preview cache | Existing File Platform storage and cleanup | Binary/rich preview bytes may be stored in the application preview/cache area, keyed by remote identity and content hash when available. Cache is never a session file, user download, or proof of current server authorization. | MODIFY |
| Download | Existing File Platform file operation surface using Expert Gateway transport | An explicit user action selects a destination and streams authorized bytes through a partial file, integrity check when `sha256` is supplied, and atomic commit. Cancel/failure leaves no destination file and does not mutate the remote reference. | MODIFY |
| Materialize | Existing File Platform replacing the Expert-specific materialization path | On demand, creates or reuses application-managed content backing under the remote resource identity after the same authorization, size, filename, and integrity gates. It can be parsed/indexed for context without becoming a second visible Session resource. | REPLACE |
| Add to Context | Existing File Platform context association | Remains distinct from session membership. The `context-file` association always points to the remote resource identity; File Platform authorizes and materializes internal backing when required. Failure leaves the `agent-output` reference intact and reports context failure only. | MODIFY |
| Remote availability | File Platform | `available`, `forbidden`, `not-found`, and retryable/unavailable behaviour is independent of task state and independent for preview versus download. | ADD |

## 6. Observable Behaviour and Lifecycle

### 6.1 Completion and discovery

1. Authoritative task completion commits task phase and result content first.
2. Artifact metadata discovery runs separately with `idle/loading/ready/error` state.
3. A metadata failure presents a retry action and does not hide the result summary or change the task phase.
4. An empty artifact list produces no artifact cards and no `agent-output` references.
5. Valid metadata records are upserted by remote identity and associated idempotently with the originating session.
6. Because discovery already adds the output to its originating session, an artifact card shows `Added` rather than offering a contradictory active Add to Session action. A future cross-session add flow is outside this scope.

### 6.2 Preview and cache

- Preview is fetched only after an explicit preview action.
- Text may remain in memory; binary/rich previews may use the application cache.
- Preview and download have independent in-flight and error state.
- A provider 403 marks the remote resource `forbidden`, invalidates its authority-sensitive preview use, and never changes task success.
- A provider 404 retains the historical reference but marks it `not-found`.
- Offline preview cache is denied by default. File Platform is the only policy owner; an explicit enterprise setting may allow an already-authorized cached copy to be shown with the label `Cached copy`, never as current Provider state.
- Provider `preview_supported` controls use of the Provider Preview endpoint and is normalized to `false` when absent under v1.0.2. Work `canPreview` is a separate Main-owned UI capability: it is true only when Provider Preview is supported or when File Platform explicitly supports a bounded client-side binary/rich preview from authorized Download bytes. Renderer never derives either capability from filename or MIME by itself.

### 6.3 Download and materialization

- No metadata, completion, session-load, or preview action creates a user-owned file.
- Download is a user-owned copy and requires an explicit destination choice.
- Materialize is application-owned, does not require a user-facing button in v3.1, and is used only by an operation such as Add to Context that needs local managed bytes. Its bytes remain internal backing for the remote resource identity.
- Provider `sha256`, when present, must match before either operation commits final bytes.
- A mismatch or interrupted transfer removes partial data, leaves the remote resource unchanged, and returns an integrity/transfer error.

### 6.4 Restart and removal

- Session load renders stored renderer-safe metadata immediately from File Platform.
- Session load does not download, preview, or re-authorize every artifact.
- Removing `context-file` removes only that association. It does not remove the originating `agent-output` association, Provider content, or a user-owned Download; internal materialized backing follows File Platform reference and cleanup policy.
- Cache cleanup removes only preview/temp bytes. It preserves remote references and user downloads.

## 7. Contract Semantics

The current consumer authority is `WORK-EXPERT-CONTRACT v1.0.2`, pinned by `contracts/work-expert/v1.0.2/consumer-lock.json` to provider tag `work-expert-contract-v1.0.2` and commit `ed408c354539eab3f4cabb119fbbc3df4b95efad`. The target implementation consumes only fields and endpoints supported by that stable ref; Provider release/CI/deployment remains out of scope.

Minimum semantics required by this PRD:

- artifact identity and task ownership;
- renderer-safe display metadata: filename, MIME/content type, size, and optional hash;
- task artifact listing;
- same-origin authenticated preview and download by artifact identity;
- explicit unsupported-preview response or capability field;
- distinguishable 403, 404, integrity, size-limit, and retryable network outcomes.

Contract rules:

1. Renderer-supplied URLs are rejected.
2. Provider `preview_url` and `download_url`, if present, are locators only. They are neither durable resource identity nor Renderer DTO fields.
3. Main resolves only same-origin provider paths and follows the existing auth refresh boundary.
4. An item missing required identity or safe display metadata is rejected as invalid metadata without invalidating other valid artifacts or task success.
5. Provider Preview returns JSON `ArtifactPreviewData` with string content; Provider Download returns binary bytes. Text Preview uses the former. A supported binary/rich client preview may use the latter only after an explicit Preview action and writes solely to bounded Preview Cache, not to a user destination.
6. Provider `preview_supported` defaults to `false` when absent and governs Provider Preview endpoint use. It does not prohibit a distinct Work client preview from authorized Download bytes when File Platform policy and type support allow it.
7. Provider 403 (`owner_forbidden`) marks the remote resource forbidden and invalidates authority-sensitive cache use; Provider 404 retains a historical `not-found` reference. Operation loading/error state remains independent from task state.
8. `permission_scope`, `storage_type`, `server_artifacts`, and `artifact_mode` are not new client authorization owners. Server responses remain the enforcement source; these fields are consumed only if the pinned contract makes them necessary to observable behaviour.

Stable external contract anchors:

- `nodeskclaw-backend/contracts/work-expert/v1.0.2/openapi.yaml`
- `nodeskclaw-backend/contracts/work-expert/v1.0.2/fixtures/http-artifact-preview.json`
- provider tag `work-expert-contract-v1.0.2` at commit `ed408c354539eab3f4cabb119fbbc3df4b95efad`

## 8. Security and Data Handling

- Renderer receives resource IDs and safe metadata only; no JWT, backend base URL, provider URL, absolute cache path, or signed locator crosses IPC.
- All provider requests remain in Main and are same-origin checked.
- Provider filenames are treated as labels. Any local write uses a sanitized basename, removes traversal/root/UNC semantics and invalid platform characters, normalizes Unicode, and enforces a bounded length.
- MIME policy uses provider content type plus content validation where applicable; extension is fallback only.
- Preview and transfer limits are independently configurable and enforced while streaming, not only from declared `size_bytes`.
- Downloads and materialization use temporary partial files and atomic final commit.
- Telemetry may record resource identity, operation, duration, cache hit/miss, byte count, and normalized outcome. It must not record file content, JWT, signed/provider URL, or secrets.

## Change Classification

| Classification | Capability | Decision |
|---|---|---|
| KEEP | Expert Gateway authentication and same-origin boundary | Continue as the only owner of provider URL/JWT and authorized Expert requests. |
| KEEP | Expert Run Service task lifecycle | Keep it as task truth and modify only completion/artifact coordination. |
| KEEP | Work File Platform production ownership | Continue as the only file resource, persistence, association, preview, context, operation, and cleanup owner. |
| KEEP | Existing `fileId`-based preview UI | Keep `useFilePreview` and `FilePreviewPanel`; Main resolves resource locality. |
| KEEP | Existing local file and Session Files behaviours | Attachments, local preview, Save As, Open, Reveal, parsing, context, search, and Agent output remain supported. |
| MODIFY | Expert artifact discovery | Replace IDs-only best-effort projection with independent discovery state and durable File Platform upsert/association. |
| MODIFY | Managed File domain and store | Add remote identity/location/availability/provenance without creating a second resource table or duplicate file owner. |
| MODIFY | File preview and operations | Resolve local or remote content behind existing file APIs; expose capability flags appropriate to locality. |
| MODIFY | Session Files and context | Render remote output, make membership idempotent, and materialize only when context needs bytes. |
| ADD | Expert remote provider binding | Add provider-specific resolution beneath File Platform while reusing Expert Gateway transport. |
| ADD | Chat artifact card | Add the missing renderer presentation backed by the same File Platform resource view. |
| ADD | Remote preview cache and availability lifecycle | Add only within existing File Platform storage/cleanup ownership. |
| REPLACE | Expert-specific materialization and download IPC | Replace `expert:download-artifact` and its direct Managed File insertion with unified File Platform Preview/Download/Materialize operations by remote resource ID. |
| REMOVE | Obsolete Expert download bridge and direct File Platform writes | Remove the Expert IPC/preload download channel and the standalone transfer module after the unified operations are live. |
| REMOVE | IDs-only artifact truth | Remove `artifactIds` as a standalone renderer/domain truth once live resource references and durable File Platform records replace it. |

## Replacement / Removal Matrix

| Replaced production path | Replacement owner/path | Removal condition |
|---|---|---|
| `expert:download-artifact` preload/IPC entry and `downloadExpertArtifact` direct materialization/Managed File insertion | Existing File Platform operations by `fileId`, delegating Expert transport to the existing Expert Gateway Client | Remote resource discovery, explicit Download, same-identity internal Materialize, integrity validation, and regression coverage are all live; production search confirms no renderer consumer remains on the Expert download channel. |
| `ExpertRunProjection.artifactIds` as the only artifact representation | Live projection resource references plus durable File Platform resource/association records | Chat and restart render from resource records; completion, retry, and zero/multiple-artifact tests no longer consume IDs-only state. |

No compatibility adapter is required: current production renderer code has no consumer of `artifactIds` or `window.hermesAPI.expert.downloadArtifact`. Existing local file support is retained in the same owner and is not a legacy compatibility path.

## Acceptance Criteria

1. When an Expert task completes, result content becomes visible without waiting for artifact metadata or bytes.
2. Completion triggers asynchronous metadata discovery but never automatically calls artifact preview/download or writes artifact bytes locally.
3. Each valid artifact is persisted once as a remote File Platform resource and associated once with the originating session as `agent-output`.
4. Chat displays a real artifact card and Session Files displays the same resource under Agent output without maintaining a second copy of metadata.
5. Restart renders remote artifact name/type/size/availability from durable local metadata without downloading it.
6. Renderer state and IPC payload inspection show no JWT, backend base URL, provider preview/download URL, signed locator, or absolute cache path.
7. Supported text/Markdown artifacts preview on demand through the existing File Preview flow.
8. Supported PDF/image/binary artifacts preview through a bounded application cache created only after explicit Preview; Work may obtain those bytes through authorized Download without creating a user-owned file. Clearing that cache preserves session references and user downloads.
9. Renderer uses Main-normalized `canPreview` and never infers capability itself. Missing Provider `preview_supported` is treated as `false`; Preview remains possible only through an independently allowed Work client-preview path.
10. Download requires explicit user action and destination selection, uses partial data plus atomic commit, and leaves no final file on cancel/failure.
11. If provider `sha256` is supplied, mismatched bytes are rejected and all partial data is removed before either Download or Materialize reports success.
12. Add to Context is distinct from session membership; its `context-file` association retains the remote resource ID while File Platform materializes internal backing only as needed. It does not create a second visible Session resource, and failure does not alter task success or remove the remote output reference.
13. Provider 403 marks the artifact forbidden and does not serve a stale cache as authoritative; provider 404 retains a historical unavailable reference. Neither changes the completed task state.
14. Multiple artifacts operate independently; a failure for one does not hide valid siblings.
15. Duplicate discovery/retry/restart does not create duplicate remote resources or duplicate `(session, resource, role)` associations.
16. Offline cached preview is denied by default. When explicitly enabled by File Platform enterprise policy, the UI labels it `Cached copy` and never presents it as current Provider state.
17. Existing local Attachments, Context Files, Session Files, preview, Save As, Open, Reveal, parsing/search, Expert SSE, cancel/retry, transcript restore, and sidebar behaviours pass regression.

## 12. Source Anchors

- `contracts/work-expert/v1.0.2/consumer-lock.json`
- `apps/work/src/shared/expert.ts#ExpertArtifactDescriptor`
- `apps/work/src/shared/expert.ts#ExpertRunProjection`
- `apps/work/src/main/expert/expert-gateway-client.ts#ExpertGatewayClient`
- `apps/work/src/main/expert/expert-run-service.ts#updateProjection`
- `apps/work/src/main/expert/expert-run-service.ts#confirmTerminal`
- `apps/work/src/main/expert/expert-artifact-download.ts#downloadExpertArtifact`
- `apps/work/src/shared/files/managed-file.ts#ManagedFile`
- `apps/work/src/shared/files/file-association.ts#FileAssociation`
- `apps/work/src/main/files/file-service.ts#fileService`
- `apps/work/src/main/files/file-preview-service.ts#getPreviewDescriptor`
- `apps/work/src/main/files/file-cleanup-service.ts#cleanupTempFiles`
- `apps/work/src/renderer/src/hooks/files/useFilePreview.ts#useFilePreview`
- `apps/work/src/renderer/src/components/files/preview/FilePreviewPanel.tsx#FilePreviewPanel`
- `apps/work/src/renderer/src/screens/Chat/session-files/SessionFilesPanel.tsx#SessionFilesPanel`
