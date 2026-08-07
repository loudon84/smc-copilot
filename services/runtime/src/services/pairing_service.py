from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.runtime_enums import DevicePairingStatus, DeviceStatus
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import Device, DevicePairing, RuntimeAuditLog
from schemas.runtime import (
    DeviceResponse,
    PairingConfirmRequest,
    PairingConfirmResponse,
    PairingStartResponse,
)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# @lat: [[auth-pairing#设备配对]]
class PairingService:
    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._session = session

    async def start(self, *, ttl_seconds: int = 300) -> PairingStartResponse:
        challenge = secrets.token_urlsafe(32)
        pairing = DevicePairing(
            challenge_hash=hash_token(challenge),
            status=DevicePairingStatus.PENDING.value,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds),
        )
        self._session.add(pairing)
        await self._session.flush()
        return PairingStartResponse(
            pairingId=pairing.id,
            challenge=challenge,
            expiresAt=pairing.expires_at,
        )

    async def confirm(self, pairing_id: str, body: PairingConfirmRequest) -> PairingConfirmResponse:
        pairing = await self._session.get(DevicePairing, pairing_id)
        if pairing is None:
            raise RuntimeServiceError("Pairing not found", code="not_found")
        if pairing.status != DevicePairingStatus.PENDING.value:
            raise RuntimeServiceError("Pairing is not pending", code="invalid_state")
        now = datetime.now(timezone.utc)
        expires = pairing.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if now > expires:
            pairing.status = DevicePairingStatus.EXPIRED.value
            await self._session.flush()
            raise RuntimeServiceError("Pairing challenge expired", code="unauthorized")
        if hash_token(body.challenge) != pairing.challenge_hash:
            raise RuntimeServiceError("Invalid challenge", code="unauthorized")

        device_token = secrets.token_urlsafe(48)
        device = Device(
            name=body.device_name,
            token_hash=hash_token(device_token),
            status=DeviceStatus.ACTIVE.value,
            last_seen_at=now,
        )
        self._session.add(device)
        pairing.status = DevicePairingStatus.CONFIRMED.value
        pairing.confirmed_at = now
        await self._session.flush()
        await self._audit(device.id, "device.paired", "device", device.id)
        return PairingConfirmResponse(deviceId=device.id, deviceToken=device_token, name=device.name)

    async def list_devices(self) -> list[DeviceResponse]:
        result = await self._session.execute(select(Device).order_by(Device.created_at.desc()))
        return [
            DeviceResponse(
                id=d.id,
                name=d.name,
                status=d.status,
                lastSeenAt=d.last_seen_at,
                createdAt=d.created_at,
            )
            for d in result.scalars().all()
        ]

    async def revoke(self, device_id: str) -> None:
        device = await self._session.get(Device, device_id)
        if device is None:
            raise RuntimeServiceError("Device not found", code="not_found")
        device.status = DeviceStatus.REVOKED.value
        device.revoked_at = datetime.now(timezone.utc)
        await self._session.flush()
        await self._audit(device.id, "device.revoked", "device", device.id)

    async def authenticate_token(self, token: str) -> Device | None:
        th = hash_token(token)
        result = await self._session.execute(
            select(Device).where(Device.token_hash == th, Device.status == DeviceStatus.ACTIVE.value)
        )
        device = result.scalar_one_or_none()
        if device:
            device.last_seen_at = datetime.now(timezone.utc)
            await self._session.flush()
        return device

    async def _audit(self, device_id: str | None, action: str, resource_type: str, resource_id: str) -> None:
        self._session.add(
            RuntimeAuditLog(
                device_id=device_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                result="ok",
            )
        )
        await self._session.flush()
