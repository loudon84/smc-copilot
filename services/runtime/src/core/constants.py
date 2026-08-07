from __future__ import annotations

from enum import StrEnum


class ProfileType(StrEnum):
    DEFAULT = "default"
    WRITER = "writer"
    CODING = "coding"
    ENGINEER = "engineer"
    FINANCE = "finance"
    RESEARCH = "research"
    SPECIALIST = "specialist"
    HURMAN = "hurman"
    SALES = "sales"


class GatewayStatus(StrEnum):
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    ERROR = "error"
    RESTARTING = "restarting"
