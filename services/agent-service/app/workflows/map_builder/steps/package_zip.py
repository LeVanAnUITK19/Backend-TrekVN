"""
Step: package all map artifacts into a single ZIP file.

The ZIP format MUST match the existing Flutter convention:
  manifest.json         ← top-level metadata (matching OfflineMapManifest)
  style.json            ← MapLibre style
  {slug}.mbtiles        ← base vector tiles (required)
  {slug}-contours.mbtiles    ← contours (required)
  {slug}-hillshade.mbtiles   ← hillshade (required)
  {slug}-routes.geojson      ← route GeoJSON (from trekking-service)
  {slug}-milestones.geojson  ← milestones GeoJSON (from trekking-service)

All files are placed at the root of the ZIP (no subdirectory nesting)
to match the existing ba-den-v1.zip structure that Flutter expects.
"""

from __future__ import annotations

import json
import logging
import zipfile
from pathlib import Path

from app.utils.hashing import sha256_file

from ..state import MapBuilderState
from ..artifacts import fail_step, inspect_mbtiles

logger = logging.getLogger(__name__)


def _build_manifest(state: MapBuilderState, sha256_map: dict[str, str]) -> dict:
    """
    Build manifest.json matching the schema Flutter's OfflineMapManifest expects.

    Fields parsed by Flutter:
      packageId, version, name, description,
      bounds [minLon,minLat,maxLon,maxLat],
      minZoom, maxZoom, centerLat, centerLng,
      layers [{ id, file, type }],
      geojson { routes, milestones },
      sha256 { filename: hex }
    """
    center_lon = (state.bbox_min_lon + state.bbox_max_lon) / 2
    center_lat = (state.bbox_min_lat + state.bbox_max_lat) / 2

    layers = []
    if state.base_mbtiles_path:
        layers.append({"id": "base", "file": state.base_mbtiles_path.name, "type": "vector"})
    if state.contours_mbtiles_path:
        layers.append({"id": "contours", "file": state.contours_mbtiles_path.name, "type": "vector"})
    if state.hillshade_mbtiles_path:
        layers.append({"id": "hillshade", "file": state.hillshade_mbtiles_path.name, "type": "raster"})
    for layer in layers:
        info = inspect_mbtiles(state.work_dir / layer["file"], layer["type"])
        layer.update(minZoom=info["minzoom"], maxNativeZoom=info["maxzoom"], tileCount=info["count"])

    slug = state.place_slug
    return {
        "packageId": f"{slug}-v{state.map_version}",
        "version": state.map_version,
        "name": state.place_name,
        "description": f"Bản đồ offline khu vực {state.place_name}",
        "bounds": [
            state.bbox_min_lon, state.bbox_min_lat,
            state.bbox_max_lon, state.bbox_max_lat,
        ],
        "minZoom": state.min_zoom,
        "maxZoom": state.max_zoom,
        "maxNativeZoom": layers[0]["maxNativeZoom"] if layers else None,
        "center": [center_lon, center_lat],
        "style": "style.json",
        "attribution": "© OpenStreetMap contributors; Mapzen terrain (when generated from Skadi)",
        "osmSource": state.osm_source,
        "centerLat": center_lat,
        "centerLng": center_lon,
        "layers": layers,
        "geojson": {
            "routes": f"{slug}-routes.geojson" if state.routes_geojson_path else "",
            "milestones": f"{slug}-milestones.geojson" if state.milestones_geojson_path else "",
        },
        "sha256": sha256_map,
    }


async def package_zip(state: MapBuilderState) -> MapBuilderState:
    """Assemble all artifacts into the final map.zip."""
    assert state.work_dir is not None
    assert state.zip_file_name is not None

    for attr in ("base_mbtiles_path", "contours_mbtiles_path", "hillshade_mbtiles_path",
                 "routes_geojson_path", "milestones_geojson_path", "style_json_path"):
        path = getattr(state, attr)
        if not path or not path.is_file() or path.stat().st_size == 0:
            return fail_step(state, "PACKAGE_ZIP", f"Required artifact missing: {attr}")

    zip_path = state.work_dir / state.zip_file_name

    # Collect all required payloads after the completeness check
    files_to_pack: list[Path] = []

    if state.base_mbtiles_path and state.base_mbtiles_path.exists():
        files_to_pack.append(state.base_mbtiles_path)
    if state.contours_mbtiles_path and state.contours_mbtiles_path.exists():
        files_to_pack.append(state.contours_mbtiles_path)
    if state.hillshade_mbtiles_path and state.hillshade_mbtiles_path.exists():
        files_to_pack.append(state.hillshade_mbtiles_path)
    if state.routes_geojson_path and state.routes_geojson_path.exists():
        files_to_pack.append(state.routes_geojson_path)
    if state.milestones_geojson_path and state.milestones_geojson_path.exists():
        files_to_pack.append(state.milestones_geojson_path)
    if state.style_json_path and state.style_json_path.exists():
        files_to_pack.append(state.style_json_path)

    # Build SHA-256 map for files that are packed
    sha256_map: dict[str, str] = {}
    for f in files_to_pack:
        sha256_map[f.name] = sha256_file(f)

    # Build and write manifest.json BEFORE packaging
    manifest_dict = _build_manifest(state, sha256_map)
    manifest_path = state.work_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest_dict, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    files_to_pack.append(manifest_path)

    # Create ZIP (files at root, no subdirectory)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for f in files_to_pack:
            zf.write(f, arcname=f.name)

    state.zip_path = zip_path
    state.zip_size_bytes = zip_path.stat().st_size
    state.zip_sha256 = sha256_file(zip_path)

    state.update_step("PACKAGE_ZIP", "DONE")
    logger.info(
        "ZIP packaged: %s (%d bytes, sha256=%s…)",
        zip_path.name, state.zip_size_bytes, state.zip_sha256[:12],
    )
    return state
