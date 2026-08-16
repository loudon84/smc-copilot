# Worker runtime (lifespan vs standalone)

`opsi-control` v1.2 keeps Dispatcher and Reconciler outside the HTTP request and adds a durable rollout orchestrator.

- Default: FastAPI lifespan starts dispatcher, reconciler, and rollout loops (`worker_mode=lifespan`).
- Alternative: `worker_mode=standalone` plus a dedicated process that imports `workers.runtime.WorkerRuntime`.
- Test env (`SMC_OPSI_ENV=test`) does not start background loops; tests call `ActionService.dispatch_once` / `RolloutService.dispatch_once`.
- API processes must not each start duplicate worker loops. Production `/ready` requires dispatcher, reconciler, and rollout heartbeats plus DB/OPSI/Secret/JWKS and Alembic head.
- Rollout Worker reuses v1.1 Action primitives; it must not open a side-channel to Windows Endpoint, Gateway, or Work.

