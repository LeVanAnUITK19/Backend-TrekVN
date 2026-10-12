"""Map Builder workflow state — passed between pipeline steps."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional


@dataclass
class MapBuilderState:
    # Input
    job_id: str
    trekking_place_id: str
    place_name: str
    place_slug: str          # derived from place_name
    publish_target_type: str  # PLACE | ROUTE
    publish_target_id: str
    bbox_min_lon: float
    bbox_min_lat: float
    bbox_max_lon: float
    bbox_max_lat: float
    min_zoom: int
    max_zoom: int
    admin_id: str

    # Working directory for all generated files
    work_dir: Optional[Path] = None

    # Per-step outputs
    osm_pbf_path: Optional[Path] = None       # raw OSM extract
    osm_source: Optional[dict[str, Any]] = None
    dem_path: Optional[Path] = None
    base_mbtiles_path: Optional[Path] = None  # vector tiles
    terrain_mbtiles_path: Optional[Path] = None
    contours_mbtiles_path: Optional[Path] = None
    hillshade_mbtiles_path: Optional[Path] = None
    style_json_path: Optional[Path] = None
    routes_geojson_path: Optional[Path] = None
    milestones_geojson_path: Optional[Path] = None
    zip_path: Optional[Path] = None
    zip_sha256: Optional[str] = None
    zip_size_bytes: Optional[int] = None

    # Version counter (incremented from current production version)
    map_version: int = 1

    # File name following the existing convention: {slug}-v{N}-flutter.zip
    zip_file_name: Optional[str] = None

    # Step tracking
    steps: list[dict[str, Any]] = field(default_factory=list)
    current_step: Optional[str] = None
    percent: int = 0

    # Errors
    errors: list[str] = field(default_factory=list)
    final_status: str = "PROCESSING"   # → PENDING_REVIEW | FAILED

    # Dependency availability flags (checked at validate step)
    osmium_available: bool = False
    tilemaker_available: bool = False
    gdal_available: bool = False
    mbutil_available: bool = False

    def step_names(self) -> list[str]:
        return [s["name"] for s in self.steps]

    def update_step(self, name: str, step_status: str, error: Optional[str] = None) -> None:
        for s in self.steps:
            if s["name"] == name:
                s["status"] = step_status
                if error:
                    s["error"] = error
                return
        self.steps.append({
            "name": name,
            "status": step_status,
            "error": error,
        })
