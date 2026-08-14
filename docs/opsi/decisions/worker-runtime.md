# Worker runtime (lifespan vs standalone)

`opsi-control` v1.1 runs Dispatcher and Reconciler outside the HTTP request.

- Default: FastAPI lifespan starts one dispatcher loop and one reconciler loop (`worker_mode=lifespan`).
- Alternative: `worker_mode=standalone` plus a dedicated process that imports `workers.runtime.WorkerRuntime`.
- Test env (`SMC_OPSI_ENV=test`) does not start background loops; tests call `ActionService.dispatch_once` / `reconcile_once`.
- API processes must not each start duplicate worker loops. Production `/ready` requires dispatcher and reconciler heartbeats.
