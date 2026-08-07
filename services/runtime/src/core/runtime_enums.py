from __future__ import annotations

from enum import StrEnum


class RuntimeVersionStatus(StrEnum):
    INSTALLED = "installed"
    ACTIVE = "active"
    INACTIVE = "inactive"
    INVALID = "invalid"
    PENDING_DELETE = "pending_delete"


class RuntimeJobType(StrEnum):
    INSTALL = "install"
    UPDATE = "update"
    ROLLBACK = "rollback"
    DOCTOR = "doctor"
    BACKUP = "backup"
    RESTORE = "restore"
    CONFIG_MIGRATE = "config_migrate"
    RUNTIME_CLEANUP = "runtime_cleanup"
    BOOTSTRAP = "bootstrap"


class RuntimeJobStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class InstanceStatus(StrEnum):
    CREATED = "created"
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    DEGRADED = "degraded"
    STOPPING = "stopping"
    RESTARTING = "restarting"
    FAILED = "failed"
    ERROR = "error"


class DevicePairingStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class DeviceStatus(StrEnum):
    ACTIVE = "active"
    REVOKED = "revoked"


class BootstrapSessionStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    COMPLETED = "completed"
    EXPIRED = "expired"
    INVALIDATED = "invalidated"
