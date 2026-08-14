from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass

from core.config import Settings
from db.repositories.interfaces import RepositoryBundle
from integrations.opsi_jsonrpc import OpsiJsonRpc
from workers.action_dispatcher import dispatch_queued
from workers.result_reconciler import reconcile_open

log = logging.getLogger("opsi.workers")


@dataclass
class WorkerRuntime:
    repos: RepositoryBundle
    rpc: OpsiJsonRpc
    settings: Settings
    stop: asyncio.Event
    worker_id: str = ""

    async def run_dispatcher(self) -> None:
        worker_id = self.worker_id or f"dispatcher-{os.getpid()}"
        while not self.stop.is_set():
            try:
                await dispatch_queued(self.repos, self.rpc, self.settings.product_id, worker_id)
            except Exception:
                log.exception("dispatcher tick failed")
            try:
                await asyncio.wait_for(self.stop.wait(), timeout=2.0)
            except TimeoutError:
                continue

    async def run_reconciler(self) -> None:
        worker_id = self.worker_id or f"reconciler-{os.getpid()}"
        while not self.stop.is_set():
            try:
                await reconcile_open(self.repos, self.rpc, self.settings.product_id, worker_id)
            except Exception:
                log.exception("reconciler tick failed")
            try:
                await asyncio.wait_for(self.stop.wait(), timeout=3.0)
            except TimeoutError:
                continue
