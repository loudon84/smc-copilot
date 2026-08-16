from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class ComplianceStatus(StrEnum):
    COMPLIANT = "COMPLIANT"
    DRIFTED = "DRIFTED"
    UNKNOWN = "UNKNOWN"
    EXEMPT = "EXEMPT"


@dataclass(frozen=True)
class ComplianceRow:
    client_id: str
    depot_id: str
    desired_version: str
    observed_version: str
    desired_digest: str
    observed_digest: str
    owner: str
    health: str
    status: ComplianceStatus
    observed_at: datetime
    source: str
    digest: str
    critical: bool = False


def classify(
    *,
    desired_version: str,
    observed_version: str,
    desired_digest: str,
    observed_digest: str,
    owner: str,
    health: str,
    stale: bool,
    exempt: bool,
) -> tuple[ComplianceStatus, bool]:
    if exempt:
        return ComplianceStatus.EXEMPT, False
    if stale or not observed_version or not observed_digest:
        return ComplianceStatus.UNKNOWN, False
    if owner != "opsi" or observed_digest != desired_digest:
        return ComplianceStatus.DRIFTED, True
    if observed_version != desired_version or health != "healthy":
        return ComplianceStatus.DRIFTED, health == "unhealthy" and owner != "opsi"
    return ComplianceStatus.COMPLIANT, False
