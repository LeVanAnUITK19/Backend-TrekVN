"""Request/response schemas for Map Builder API."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator


class BboxInput(BaseModel):
    min_lon: float = Field(..., alias="minLon", ge=-180, le=180)
    min_lat: float = Field(..., alias="minLat", ge=-90, le=90)
    max_lon: float = Field(..., alias="maxLon", ge=-180, le=180)
    max_lat: float = Field(..., alias="maxLat", ge=-90, le=90)

    model_config = {"populate_by_name": True}

    @field_validator("max_lon")
    @classmethod
    def max_lon_gt_min(cls, v: float, info) -> float:
        min_lon = info.data.get("min_lon")
        if min_lon is not None and v <= min_lon:
            raise ValueError("maxLon must be greater than minLon")
        return v

    @field_validator("max_lat")
    @classmethod
    def max_lat_gt_min(cls, v: float, info) -> float:
        min_lat = info.data.get("min_lat")
        if min_lat is not None and v <= min_lat:
            raise ValueError("maxLat must be greater than minLat")
        return v


class PublishTargetInput(BaseModel):
    type: str = Field("PLACE", pattern="^(PLACE|ROUTE)$")
    target_id: str = Field(..., alias="targetId")

    model_config = {"populate_by_name": True}


class CreateMapJobRequest(BaseModel):
    trekking_place_id: str = Field(..., alias="trekkingPlaceId")
    place_name: str = Field(..., alias="placeName", min_length=1, max_length=200)
    publish_target: PublishTargetInput = Field(..., alias="publishTarget")
    bbox: BboxInput
    min_zoom: int = Field(10, alias="minZoom", ge=0, le=22)
    max_zoom: int = Field(14, alias="maxZoom", ge=0, le=22)

    model_config = {"populate_by_name": True}

    @field_validator("max_zoom")
    @classmethod
    def max_zoom_gte_min(cls, v: int, info) -> int:
        min_zoom = info.data.get("min_zoom")
        if min_zoom is not None and v < min_zoom:
            raise ValueError("maxZoom must be >= minZoom")
        return v


class MapReviewActionRequest(BaseModel):
    note: Optional[str] = Field(None, max_length=2000)
