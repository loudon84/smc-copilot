from __future__ import annotations

from pydantic import BaseModel, ConfigDict


def to_camel(string: str) -> str:
    parts = string.split("_")
    return parts[0] + "".join(word.capitalize() for word in parts[1:])


class CamelModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        ser_json_by_alias=True,
    )


class ErrorDetail(CamelModel):
    code: str
    message: str
    details: dict = {}


class ErrorResponse(CamelModel):
    error: ErrorDetail
