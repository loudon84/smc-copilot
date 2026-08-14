# Lab Depot publish (operator only)

Cursor/CI must not run these commands against production.

1. Copy the real `.opsi` from the Linux builder to the Lab Depot host.
2. `opsi-package-manager -i smc-hermes-agent_<productVersion>-<packageVersion>.opsi`
3. Read back:

```text
productOnDepot_getObjects { "productId": "smc-hermes-agent" }
```

Confirm `productVersion` and `packageVersion`.

4. Rollback: keep `current` and one `previous` package. Unpublish with `opsi-package-manager -r` then install previous.

Do not mark `docs/opsi/evidence/v1.1/STATUS.md` as proven from this runbook alone.
