# OPSI 4.3 Lab PoC — STATUS

Decision: **NO-GO**
Verification: **not_proven**

Unsigned template. Cursor must not publish packages to a production Depot, enroll live clients, or mark `proven`.

## Scope

- Inventory RPCs: `host_getObjects`, `productOnDepot_getObjects`, `productOnClient_getObjects`
- Client-specific `productPropertyState` isolation
- `actionRequest` `setup | update | uninstall | custom`
- `request_id` correlation through instlog / approved result channel
- SYSTEM vs user-context bootstrap (no `systemprofile` Hermes Home)

## Operator checklist

1. Record `opsiconfd` version, license modules, and whether `log_read` returns instlog for `smc-hermes-agent`.
2. Two lab clients: different `custom_operation` + `request_id`; confirm properties do not overwrite.
3. Confirm hostname/client id used by OPSI; do not invent inventory.
4. Secret scan of properties, logs, and result JSON.
5. Confirm SYSTEM staging path is `C:\ProgramData\SMC\opsi` only.

Record version, git commit, time, and secret-free summaries here only after the operator run.
