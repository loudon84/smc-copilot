from __future__ import annotations

from dataclasses import dataclass

from aiobotocore.session import get_session
from botocore.exceptions import ClientError

from app.core.config import get_settings


@dataclass(frozen=True)
class SnapshotPutResult:
    bucket: str
    key: str


class SnapshotStorage:
    async def _ensure_bucket(self, client, bucket: str) -> None:
        try:
            await client.head_bucket(Bucket=bucket)
        except ClientError:
            await client.create_bucket(Bucket=bucket)

    async def put_snapshot(self, *, bucket: str, key: str, payload: bytes, content_type: str = "application/json") -> SnapshotPutResult:
        settings = get_settings()
        session = get_session()
        async with session.create_client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
        ) as client:
            await self._ensure_bucket(client, bucket)
            await client.put_object(Bucket=bucket, Key=key, Body=payload, ContentType=content_type)
        return SnapshotPutResult(bucket=bucket, key=key)

    async def get_snapshot(self, *, bucket: str, key: str) -> bytes:
        settings = get_settings()
        session = get_session()
        async with session.create_client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
        ) as client:
            obj = await client.get_object(Bucket=bucket, Key=key)
            async with obj["Body"] as stream:
                return await stream.read()

    async def object_exists(self, *, bucket: str, key: str) -> bool:
        settings = get_settings()
        session = get_session()
        async with session.create_client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
        ) as client:
            try:
                await client.head_object(Bucket=bucket, Key=key)
                return True
            except ClientError as e:
                status = e.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
                if status == 404:
                    return False
                raise
