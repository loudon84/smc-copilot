"""State wrappers for smc_handover."""

from __future__ import annotations

from typing import Any

__virtualname__ = "smc_handover"


def __virtual__():
    return __virtualname__


def _salt():
    return globals().get("__salt__", {})


def _opts():
    return globals().get("__opts__", {})


def committed(name: str, desired_owner: str = "salt") -> dict[str, Any]:
    ret: dict[str, Any] = {"name": name, "changes": {}, "result": False, "comment": ""}
    if _opts().get("test"):
        ret["result"] = None
        ret["comment"] = "Owner would switch to salt via smc_handover.commit"
        return ret
    result = _salt()["smc_handover.commit"](desired_owner=desired_owner)
    ret["result"] = bool(result.get("ok"))
    ret["changes"] = result if ret["result"] else {}
    ret["comment"] = "owner committed" if ret["result"] else result.get("error", "commit failed")
    return ret


def rolled_back(name: str, previous_owner: str | None = None) -> dict[str, Any]:
    ret: dict[str, Any] = {"name": name, "changes": {}, "result": False, "comment": ""}
    if _opts().get("test"):
        ret["result"] = None
        ret["comment"] = "Owner would rollback via smc_handover.rollback"
        return ret
    result = _salt()["smc_handover.rollback"](previous_owner=previous_owner)
    ret["result"] = bool(result.get("ok"))
    ret["changes"] = result if ret["result"] else {}
    ret["comment"] = "owner rolled back" if ret["result"] else result.get("error", "rollback failed")
    return ret
