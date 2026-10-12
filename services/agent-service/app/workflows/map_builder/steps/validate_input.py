"""Step: validate Map Builder input and check tool availability."""

from __future__ import annotations

import shutil
from pathlib import Path

from app.config import Settings
from app.tools.map_tool_runtime import check_map_tools

from ..state import MapBuilderState


async def validate_input(state: MapBuilderState, settings: Settings) -> MapBuilderState:
    errors = []

    # ── Validate bbox ──────────────────────────────────────────────────────
    if state.bbox_min_lon >= state.bbox_max_lon:
        errors.append(f"minLon ({state.bbox_min_lon}) must be less than maxLon ({state.bbox_max_lon})")
    if state.bbox_min_lat >= state.bbox_max_lat:
        errors.append(f"minLat ({state.bbox_min_lat}) must be less than maxLat ({state.bbox_max_lat})")

    # Valid ranges
    for lon in (state.bbox_min_lon, state.bbox_max_lon):
        if not (-180 <= lon <= 180):
            errors.append(f"Invalid longitude: {lon}")
    for lat in (state.bbox_min_lat, state.bbox_max_lat):
        if not (-85.05112878 <= lat <= 85.05112878):
            errors.append(f"Invalid latitude: {lat}")

    # Bbox area guard
    area = abs(state.bbox_max_lon - state.bbox_min_lon) * abs(state.bbox_max_lat - state.bbox_min_lat)
    if area > settings.map_bbox_max_area_deg2:
        errors.append(
            f"Bbox area {area:.4f}° exceeds maximum {settings.map_bbox_max_area_deg2}°. "
            "Use a smaller bbox."
        )

    # ── Validate zoom ──────────────────────────────────────────────────────
    if not (0 <= state.min_zoom <= 22):
        errors.append(f"minZoom {state.min_zoom} out of range [0, 22]")
    if not (0 <= state.max_zoom <= 22):
        errors.append(f"maxZoom {state.max_zoom} out of range [0, 22]")
    if state.min_zoom > state.max_zoom:
        errors.append(f"minZoom ({state.min_zoom}) must be <= maxZoom ({state.max_zoom})")

    # ── Validate placeName (sanitize against injection) ───────────────────
    dangerous_chars = [";", "&", "|", "`", "$", "(", ")", "<", ">", "\\"]
    for ch in dangerous_chars:
        if ch in state.place_name:
            errors.append(f"placeName contains invalid character: '{ch}'")

    # ── Check tool availability (informational — pipeline adapts) ─────────
    state.osmium_available = shutil.which("osmium") is not None
    state.tilemaker_available = shutil.which("tilemaker") is not None
    state.gdal_available = shutil.which("gdal_translate") is not None or shutil.which("gdaldem") is not None
    state.mbutil_available = shutil.which("mb-util") is not None or shutil.which("mbutil") is not None

    if settings.map_pipeline_mode == "full":
        if settings.map_source_package:
            if not Path(settings.map_source_package).is_file():
                errors.append("MAP_SOURCE_PACKAGE does not exist")
        else:
            if not errors:
                try:
                    missing, backend = await check_map_tools(settings)
                    state.osmium_available = "osmium" not in missing
                    state.tilemaker_available = "tilemaker" not in missing
                    state.gdal_available = not any(tool.startswith("gdal") for tool in missing)
                    if missing:
                        errors.append("Missing map tools: " + ", ".join(missing) +
                                      f" (runtime: {backend}). Build the map tools image or configure MAP_SOURCE_PACKAGE.")
                except Exception as exc:
                    errors.append(str(exc))
            if settings.map_dem_path and not Path(settings.map_dem_path).is_file():
                errors.append("MAP_DEM_PATH does not exist")
            if settings.map_osm_pbf_path and not Path(settings.map_osm_pbf_path).is_file():
                errors.append("MAP_OSM_PBF_PATH does not exist")
            if state.min_zoom > settings.map_native_max_zoom:
                errors.append("minZoom exceeds MAP_NATIVE_MAX_ZOOM")

    if errors:
        state.errors.extend(errors)
        state.final_status = "FAILED"
        state.update_step("VALIDATE_INPUT", "FAILED", "; ".join(errors))
    else:
        state.update_step("VALIDATE_INPUT", "DONE")

    return state
