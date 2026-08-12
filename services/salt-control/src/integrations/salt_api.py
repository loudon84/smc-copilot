from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin

import httpx

from integrations.salt_master import PendingKey, SaltMaster

# Fixed function whitelist — no cmd.run / powershell / shell.
ALLOWED_LOCAL_FUNCS = frozenset(
    {
        "test.ping",
        "saltutil.sync_all",
        "saltutil.refresh_pillar",
        "state.show_highstate",
        "state.highstate",
        "sys.list_modules",
        "smc_hermes.inspect",
        "smc_hermes.health",
        "smc_hermes.doctor",
        "smc_hermes.install",
        "smc_hermes.upgrade",
        "smc_hermes.rollback",
        "smc_hermes.apply_config",
        "smc_hermes.restart",
        "smc_hermes.gateway_restart",
        "smc_handover.commit",
        "smc_handover.rollback",
        "smc_handover.migrate",
        "smc_handover.remigrate",
    }
)

ALLOWED_WHEEL_FUNCS = frozenset({"key.list_all", "key.finger", "key.accept", "key.delete"})


def _assert_ep_target(minion_id: str) -> None:
    if not minion_id.startswith("ep_"):
        raise PermissionError(f"salt-api targets must be ep_*; got {minion_id}")


@dataclass
class SaltApiMaster:
    """Live Salt Master adapter over salt-api (rest_cherrypy) with eAuth."""

    name: str
    api_url: str
    username: str
    password: str
    eauth: str = "pam"
    verify_tls: bool | str = True
    _token: str | None = field(default=None, init=False, repr=False)
    _token_expires_at: float = field(default=0.0, init=False, repr=False)
    _client: httpx.AsyncClient | None = field(default=None, init=False, repr=False)

    def __post_init__(self) -> None:
        if not self.api_url.startswith("https://"):
            raise ValueError("salt-api URL must be https")

    async def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(verify=self.verify_tls, timeout=30.0)
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _login(self) -> str:
        now = time.time()
        if self._token and now < self._token_expires_at - 30:
            return self._token
        client = await self._http()
        resp = await client.post(
            urljoin(self.api_url.rstrip("/") + "/", "login"),
            json={"username": self.username, "password": self.password, "eauth": self.eauth},
        )
        if resp.status_code >= 400:
            self._token = None
            raise RuntimeError("salt-api login failed")
        data = resp.json()
        return_data = (data.get("return") or [{}])[0]
        token = return_data.get("token")
        if not token:
            raise RuntimeError("salt-api login missing token")
        # Token stays in memory only — never logged.
        self._token = str(token)
        expire = return_data.get("expire")
        self._token_expires_at = float(expire) if expire else now + 600
        return self._token

    async def _headers(self) -> dict[str, str]:
        token = await self._login()
        return {"X-Auth-Token": token, "Accept": "application/json"}

    async def _post(self, payload: dict[str, Any]) -> Any:
        client = await self._http()
        headers = await self._headers()
        resp = await client.post(self.api_url.rstrip("/") + "/", headers=headers, json=payload)
        if resp.status_code == 401:
            self._token = None
            headers = await self._headers()
            resp = await client.post(self.api_url.rstrip("/") + "/", headers=headers, json=payload)
        if resp.status_code >= 400:
            raise RuntimeError(f"salt-api error status={resp.status_code}")
        return resp.json()

    async def list_pending(self) -> list[PendingKey]:
        data = await self._post({"client": "wheel", "fun": "key.list_all"})
        return_block = (data.get("return") or [{}])[0]
        data_block = return_block.get("data", return_block)
        minions_pre = data_block.get("minions_pre") or data_block.get("return", {}).get("minions_pre") or []
        if isinstance(minions_pre, dict):
            names = list(minions_pre.keys())
        else:
            names = list(minions_pre)
        pending: list[PendingKey] = []
        for name in names:
            finger = await self._finger(name)
            pending.append(PendingKey(minion_id=str(name), fingerprint=finger))
        return pending

    async def _finger(self, minion_id: str) -> str:
        data = await self._post({"client": "wheel", "fun": "key.finger", "match": minion_id})
        return_block = (data.get("return") or [{}])[0]
        payload = return_block.get("data", return_block).get("return", return_block)
        if isinstance(payload, dict):
            for key in ("minions_pre", "minions", "minions_denied", "minions_rejected"):
                bucket = payload.get(key) or {}
                if isinstance(bucket, dict) and minion_id in bucket:
                    return str(bucket[minion_id])
                if isinstance(bucket, str):
                    return bucket
            if minion_id in payload:
                return str(payload[minion_id])
        return str(payload)

    async def accept(self, minion_id: str, fingerprint: str) -> None:
        _assert_ep_target(minion_id)
        pending = await self.list_pending()
        found = next((p for p in pending if p.minion_id == minion_id), None)
        if found is None:
            raise KeyError(f"pending key missing: {minion_id}")
        if found.fingerprint != fingerprint:
            raise ValueError("fingerprint mismatch")
        data = await self._post({"client": "wheel_async", "fun": "key.accept", "match": minion_id})
        jid = _extract_jid(data)
        if jid:
            await self.wait_job(jid, timeout_seconds=60)

    async def delete_key(self, minion_id: str) -> None:
        # Allow deleting legacy hostname keys during adoption as well as ep_*.
        data = await self._post({"client": "wheel_async", "fun": "key.delete", "match": minion_id})
        jid = _extract_jid(data)
        if jid:
            await self.wait_job(jid, timeout_seconds=60)

    async def ping(self, minion_id: str) -> bool:
        jid = await self.local_async(minion_id, "test.ping")
        result = await self.wait_job(jid, timeout_seconds=60)
        return bool(_minion_result(result, minion_id))

    async def sync_all(self, minion_id: str) -> bool:
        jid = await self.local_async(minion_id, "saltutil.sync_all")
        result = await self.wait_job(jid, timeout_seconds=180)
        return _minion_result(result, minion_id) is not None

    async def highstate(self, minion_id: str, *, test: bool = False) -> bool:
        kwarg = {"test": True} if test else None
        jid = await self.local_async(minion_id, "state.highstate", kwarg=kwarg)
        result = await self.wait_job(jid, timeout_seconds=600)
        value = _minion_result(result, minion_id)
        if value is None:
            return False
        if isinstance(value, dict):
            return all(bool(v.get("result", True)) for v in value.values() if isinstance(v, dict))
        return bool(value)

    async def local_async(
        self,
        minion_id: str,
        function: str,
        *,
        arg: list[Any] | None = None,
        kwarg: dict[str, Any] | None = None,
    ) -> str:
        _assert_ep_target(minion_id)
        if function not in ALLOWED_LOCAL_FUNCS and not function.startswith("smc_hermes."):
            raise PermissionError(f"function not allowlisted: {function}")
        if function.startswith("cmd.") or function.startswith("ps.") or "powershell" in function.lower():
            raise PermissionError(f"forbidden function: {function}")
        payload: dict[str, Any] = {
            "client": "local_async",
            "tgt": minion_id,
            "fun": function,
        }
        if arg:
            payload["arg"] = arg
        if kwarg:
            payload["kwarg"] = kwarg
        data = await self._post(payload)
        jid = _extract_jid(data)
        if not jid:
            raise RuntimeError("salt-api local_async missing jid")
        return jid

    async def get_job(self, jid: str) -> dict[str, Any]:
        client = await self._http()
        headers = await self._headers()
        resp = await client.get(urljoin(self.api_url.rstrip("/") + "/", f"jobs/{jid}"), headers=headers)
        if resp.status_code >= 400:
            # Fallback wheel/lookup
            data = await self._post({"client": "runner", "fun": "jobs.lookup_jid", "jid": jid})
            return data if isinstance(data, dict) else {"return": data}
        return resp.json()

    async def wait_job(self, jid: str, *, timeout_seconds: float = 120.0, poll: float = 1.0) -> dict[str, Any]:
        deadline = time.time() + timeout_seconds
        last: dict[str, Any] = {}
        while time.time() < deadline:
            last = await self.get_job(jid)
            info = (last.get("info") or [{}])[0] if isinstance(last.get("info"), list) else last.get("info") or {}
            returns = last.get("return") or info.get("Result") or info.get("return")
            if returns:
                return last
            await asyncio.sleep(poll)
        return last

    async def ready(self) -> bool:
        try:
            await self._login()
            return True
        except Exception:
            return False


def _extract_jid(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None
    if "jid" in data:
        return str(data["jid"])
    ret = data.get("return")
    if isinstance(ret, list) and ret:
        first = ret[0]
        if isinstance(first, dict) and "jid" in first:
            return str(first["jid"])
        if isinstance(first, str):
            return first
    if isinstance(ret, dict) and "jid" in ret:
        return str(ret["jid"])
    return None


def _minion_result(job: dict[str, Any], minion_id: str) -> Any:
    ret = job.get("return")
    if isinstance(ret, list) and ret:
        first = ret[0]
        if isinstance(first, dict):
            return first.get(minion_id, first)
        return first
    if isinstance(ret, dict):
        return ret.get(minion_id, ret)
    info = job.get("info")
    if isinstance(info, list) and info:
        result = info[0].get("Result") if isinstance(info[0], dict) else None
        if isinstance(result, dict):
            entry = result.get(minion_id)
            if isinstance(entry, dict):
                return entry.get("return", entry)
            return entry
    return None


# Protocol structural typing
_: type[SaltMaster] = SaltApiMaster  # type: ignore[misc, assignment]
