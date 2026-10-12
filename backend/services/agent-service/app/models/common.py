"""Shared Pydantic base model and common types."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AppBaseModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        use_enum_values=True,
        arbitrary_types_allowed=True,
    )


class GeoPoint(AppBaseModel):
    """GeoJSON Point — always [longitude, latitude] per MongoDB 2dsphere convention."""

    type: str = "Point"
    coordinates: list[float]  # [longitude, latitude]

    @property
    def longitude(self) -> float:
        return self.coordinates[0]

    @property
    def latitude(self) -> float:
        return self.coordinates[1]


class BoundingBox(AppBaseModel):
    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float

    def area_deg2(self) -> float:
        return abs(self.max_lon - self.min_lon) * abs(self.max_lat - self.min_lat)

    def center(self) -> tuple[float, float]:
        return (
            (self.min_lon + self.max_lon) / 2,
            (self.min_lat + self.max_lat) / 2,
        )
