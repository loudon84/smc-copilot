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


class DesiredState(StrEnum):
    """Instance desired lifecycle state (PRD v1.5)."""

    RUNNING = "running"
    STOPPED = "stopped"


class GatewayProcessState(StrEnum):
    MISSING = "missing"
    STARTING = "starting"
    ALIVE = "alive"
    EXITED = "exited"
    FOREIGN = "foreign"
    UNKNOWN = "unknown"


class GatewayApiState(StrEnum):
    UNKNOWN = "unknown"
    UNREACHABLE = "unreachable"
    UNAUTHORIZED = "unauthorized"
    DEGRADED = "degraded"
    HEALTHY = "healthy"


class OwnershipState(StrEnum):
    OWNED = "owned"
    ADOPTED = "adopted"  # PRD v1.5.1 — restored via persistent fingerprint
    STALE = "stale"
    FOREIGN = "foreign"
    CONFLICT = "conflict"  # PRD v1.5.1 — port occupied, not safely adoptable
    UNKNOWN = "unknown"


class ShutdownReason(StrEnum):
    RELOAD = "reload"
    NORMAL_SHUTDOWN = "normal_shutdown"
    PROCESS_TERMINATION = "process_termination"
    UNKNOWN = "unknown"


class PortOwnership(StrEnum):
    FREE = "free"
    OWNED = "owned"
    FOREIGN = "foreign"
    UNKNOWN = "unknown"


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
