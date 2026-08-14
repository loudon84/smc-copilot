# Action Result Transport (OPSI 4.3)

This decision freezes how SMC request IDs, client-specific properties, ActionRequest, and detailed results move through OPSI without `opsi-control` connecting to Endpoints.

Live Lab status: **not_proven**. Cursor/CI may mark the contract `implemented`. Operator Lab evidence is required before `proven`.

## Official objects used

Allowlisted `opsiconfd` JSON-RPC methods (HTTPS `:4447/rpc`):

| Method | Use |
| --- | --- |
| `host_getObjects` | Client inventory (read-only for SMC) |
| `productOnDepot_getObjects` | Product catalog / versions (read-only) |
| `productOnClient_getObjects` / `productOnClient_updateObjects` | `actionRequest`, `actionResult`, `installationStatus` |
| `productPropertyState_getObjects` / `productPropertyState_updateObjects` | **client-specific** properties only (`objectId` = client id) |
| `log_read` | Recover redacted `SMC_ACTION_RESULT` marker and capped JSON tail |
| `backend_info` | Ready probe |

Forbidden: generic “execute any RPC” API; writing product **defaults**; putting secrets in properties or logs.

## Dispatch order (fail closed)

For each target client:

1. Write client-specific properties (`request_id`, `custom_operation`, `config_revision`, …). Never write global Product Default.
2. Read back the same `objectId` and verify values.
3. Set `productOnClient.actionRequest` to `setup | update | uninstall | custom`.
4. Persist a dispatch snapshot (`request_id`, `client_id`, property digest, action).

Any step failure records that target as failed and does not mark other targets succeeded.

## How `request_id` reaches the Endpoint

`request_id` is a **client-specific** Product Property (`smc-hermes-agent` / `request_id`). `.opsiscript` reads it and passes `--RequestId` to PowerShell. Scripts refuse to run when `request_id` is empty. Identical `request_id` is idempotent (no second side effect).

Two clients can run different `custom_operation` values at the same time because OPSI stores `productPropertyState` per `(productId, propertyId, objectId=clientId)`.

## Detailed result channel

Endpoint writes, after redaction:

1. `C:\ProgramData\SMC\opsi\results\{request_id}.json` — `smc.opsi.action-result.v1`, max 64 KiB.
2. One instlog marker line: `SMC_ACTION_RESULT request_id=... client_id=... sha256=... status=... bytes=... redacted=true`.
3. Optional capped JSON tail in instlog (max 16 KiB) for `log_read` recovery.

`opsi-control` Result Reconciler:

- Reads `productOnClient.actionResult` / `installationStatus` as the coarse OPSI state.
- Recovers `request_id` correlation from dispatch snapshot + `log_read` marker.
- Times out to `UNKNOWN` (never forges SUCCEEDED/FAILED).
- Does not SSH/WinRM/HTTP to the Endpoint.

## Size, retention, checksum

| Item | Limit |
| --- | --- |
| Action result JSON | 64 KiB |
| Diagnostic bundle total | 5 MiB |
| Per-file in bundle | 1 MiB |
| Log lines per category | 500 |
| instlog JSON tail | 16 KiB |
| Retention on Endpoint | 7 days |
| Checksum | SHA256 of redacted bytes |

## Isolation / failure cases

- Endpoint offline: request stays `DISPATCHED`/`RUNNING` until timeout → `UNKNOWN`.
- Service restart: reconciler resumes from DB poll cursor/lease.
- Duplicate request_id + same payload: 200 idempotent replay.
- Duplicate request_id + different payload: 409.
- Stale instlog: marker must match current `request_id`; older markers ignored.

## Lab protocol (operator)

See `docs/opsi/lab/POC-STATUS.md`. Required before `verificationStatus=proven`:

1. Two clients, distinct `custom_operation`, properties do not cross-write.
2. `request_id` visible from API → property → Endpoint file → `log_read` marker.
3. Secret scan of properties, instlog, and result JSON is empty.
