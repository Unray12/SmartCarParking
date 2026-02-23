from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CameraCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    source_url: str = Field(min_length=5, max_length=1024)
    enabled: bool = True


class CameraToggleRequest(BaseModel):
    enabled: bool


class CameraUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    source_url: str = Field(min_length=5, max_length=1024)
    enabled: bool | None = None


class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    source_url: str
    enabled: bool
    created_at: datetime
    updated_at: datetime
    stream_ws_path: str
