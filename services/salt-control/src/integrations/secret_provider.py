from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class SecretAcl:
    ref: str
    allowed_endpoint_ids: set[str] = field(default_factory=set)
    allowed_user_ids: set[str] = field(default_factory=set)


class SecretProvider(Protocol):
    async def resolve(self, ref: str) -> str | None: ...
    async def check_acl(self, ref: str, endpoint_id: str, user_id: str) -> bool: ...


class FakeSecretProvider:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.acls: dict[str, SecretAcl] = {}

    def put(self, ref: str, value: str, *, endpoints: set[str] | None = None, users: set[str] | None = None) -> None:
        self.values[ref] = value
        self.acls[ref] = SecretAcl(
            ref=ref,
            allowed_endpoint_ids=endpoints or set(),
            allowed_user_ids=users or set(),
        )

    async def resolve(self, ref: str) -> str | None:
        return self.values.get(ref)

    async def check_acl(self, ref: str, endpoint_id: str, user_id: str) -> bool:
        acl = self.acls.get(ref)
        if acl is None:
            return False
        endpoint_ok = not acl.allowed_endpoint_ids or endpoint_id in acl.allowed_endpoint_ids
        user_ok = not acl.allowed_user_ids or user_id in acl.allowed_user_ids
        return endpoint_ok and user_ok
