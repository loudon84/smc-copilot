from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class MemoryEntry(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    index: int
    content: str


class MemoryFileInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    content: str
    exists: bool
    last_modified: int | None = Field(default=None, alias="lastModified")
    entries: list[MemoryEntry] = Field(default_factory=list)
    char_count: int = Field(alias="charCount")
    char_limit: int = Field(alias="charLimit")


class UserProfileInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    content: str
    exists: bool
    last_modified: int | None = Field(default=None, alias="lastModified")
    char_count: int = Field(alias="charCount")
    char_limit: int = Field(alias="charLimit")


class SessionStatsInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    total_sessions: int = Field(alias="totalSessions")
    total_messages: int = Field(alias="totalMessages")


class MemoryInfoResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    memory: MemoryFileInfo
    user: UserProfileInfo
    stats: SessionStatsInfo


class MemoryEntryCreateRequest(BaseModel):
    content: str


class MemoryEntryUpdateRequest(BaseModel):
    content: str


class MemoryContentPutRequest(BaseModel):
    content: str


class UserProfilePutRequest(BaseModel):
    content: str


class MemoryMutationResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool
    error: str | None = None
