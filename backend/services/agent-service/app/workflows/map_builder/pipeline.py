"""
Map Builder pipeline runner.

Executes all steps in sequence:
  VALIDATE_INPUT → PREPARE_WORKDIR → EXTRACT_OSM → BUILD_MBTILES →
  BUILD_TERRAIN → BUILD_CONTOURS → BUILD_HILLSHADE → BUILD_GEOJSON → BUILD_STYLE →
  PACKAGE_ZIP → VALIDATE_ZIP → PENDING_REVIEW

Deterministic steps — no LLM involved anywhere.

Supports two modes:
- full: Build real tiles from OSM+DEM, or clip a configured source package
- mock: Create dummy files for UI testing (no tools required)
"""

from __future__ import annotations

import logging
import hashlib
from pathlib import Path

from app.config import Settings
from app.db.repositories.map_jobs import MapJobRepository
from app.db.repositories.workflow_events import WorkflowEventRepository

from .state import MapBuilderState
from .steps.build_contours import build_contours
from .steps.build_hillshade import build_hillshade
from .steps.build_mbtiles import build_mbtiles
from .steps.build_style import build_style
from .steps.build_terrain import build_terrain
from .steps.extract_osm import extract_osm
from .steps.package_zip import package_zip
from .steps.prepare_workdir import prepare_workdir
from .steps.validate_input import validate_input
from .steps.validate_output import validate_output

logger = logging.getLogger(__name__)

async def _run_mock_pipeline(
    state: MapBuilderState,
    settings: Settings,
    job_repo: MapJobRepository,
    event_repo: WorkflowEventRepository,
) -> MapBuilderState:
    """
    Mock pipeline for UI testing without osmium/tippecanoe/gdal.
    Creates dummy files and moves job to PENDING_REVIEW immediately.
    """
    import json
    import zipfile
    from app.utils.time import hours_from_now

    async def log_event(event: str, level: str, msg: str, meta: dict | None = None) -> None:
        await event_repo.log(
            job_id=state.job_id,
            workflow_type="MAP_BUILDER",
            event=event,
            level=level,
            message=msg,
            metadata=meta,
        )

    # Step 1: Validate input
    state = await validate_input(state, settings)
    if state.final_status == "FAILED":
        await job_repo.update(state.job_id, {"status": "FAILED", "error": {"messages": state.errors}})
        await log_event("MOCK_FAILED", "ERROR", f"Input validation failed: {state.errors}")
        return state
    await log_event("MOCK_VALIDATE", "INFO", "Mock input validated")

    # Step 2: Prepare workdir
    state = await prepare_workdir(state, settings)
    await log_event("MOCK_WORKDIR", "INFO", f"Mock workdir: {state.work_dir}")

    # Step 3-4: Create dummy files
    await job_repo.update(state.job_id, {"status": "PROCESSING"})

    work_path = Path(state.work_dir)

    # Dummy MBTiles (bắt buộc có để ZIP hợp lệ)
    mbtiles_name = f"{state.place_slug}.mbtiles"
    mbtiles = work_path / mbtiles_name
    mbtiles.write_bytes(b"MOCK MBTILES DATA - TrekVN placeholder")
    state.base_mbtiles_path = mbtiles
    await log_event("MOCK_MBTILES", "INFO", "Mock MBTiles created")

    # style.json — MapLibre style (mock)
    style_json = work_path / "style.json"
    style_data = {
        "version": 8,
        "name": f"TrekViet — {state.place_name}",
        "metadata": {
            "trekviet:packageId": f"{state.place_slug}-v{state.map_version}",
            "trekviet:version": state.map_version,
        },
        "sources": {
            "trekviet-base": {
                "type": "vector",
                "url": f"mbtiles://{mbtiles_name}",
            }
        },
        "layers": [
            {"id": "background", "type": "background", "paint": {"background-color": "#f0f0f0"}}
        ],
    }
    style_json.write_text(json.dumps(style_data, indent=2), encoding="utf-8")
    state.style_json_path = style_json
    await log_event("MOCK_STYLE", "INFO", "Mock style.json created")

    # Tính SHA-256 của mbtiles để đưa vào manifest
    import hashlib as _hl
    sha256_map = {mbtiles_name: _hl.sha256(mbtiles.read_bytes()).hexdigest()}

    # manifest.json — phải khớp schema Flutter OfflineMapManifest
    center_lon = (state.bbox_min_lon + state.bbox_max_lon) / 2
    center_lat = (state.bbox_min_lat + state.bbox_max_lat) / 2
    manifest_data = {
        "mock": True,
        "packageId": f"{state.place_slug}-v{state.map_version}",
        "version": state.map_version,
        "name": state.place_name,
        "description": f"Bản đồ offline khu vực {state.place_name}",
        "bounds": [
            state.bbox_min_lon, state.bbox_min_lat,
            state.bbox_max_lon, state.bbox_max_lat,
        ],
        "minZoom": state.min_zoom,
        "maxZoom": state.max_zoom,
        "centerLat": center_lat,
        "centerLng": center_lon,
        "layers": [
            {"id": "base", "file": mbtiles_name, "type": "vector"},
        ],
        "geojson": {"routes": "", "milestones": ""},
        "sha256": sha256_map,
    }
    manifest_path = work_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest_data, ensure_ascii=False, indent=2), encoding="utf-8")
    await log_event("MOCK_MANIFEST", "INFO", "Mock manifest.json created")

    # Đúng tên file theo convention: {slug}-v{N}-flutter.zip
    zip_name = f"{state.place_slug}-v{state.map_version}-flutter.zip"
    zip_path = work_path / zip_name

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(manifest_path, "manifest.json")
        zf.write(style_json, "style.json")
        zf.write(mbtiles, mbtiles_name)

    state.zip_path = zip_path
    state.zip_file_name = zip_name
    state.zip_size_bytes = zip_path.stat().st_size

    # SHA-256 của toàn bộ ZIP
    sha256_hash = hashlib.sha256()
    with open(zip_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256_hash.update(chunk)
    state.zip_sha256 = sha256_hash.hexdigest()

    await log_event("MOCK_ZIP", "INFO", f"Mock ZIP created: {zip_name} ({state.zip_size_bytes} bytes)")

    # Move to PENDING_REVIEW
    expires_at = hours_from_now(settings.map_artifact_ttl_hours)
    output_doc = {
        "artifactType": "MAP_ZIP",
        "tempPath": str(state.zip_path),
        "fileName": state.zip_file_name,
        "fileSizeBytes": state.zip_size_bytes,
        "sha256": state.zip_sha256,
        "metadata": {
            "mock": True,
            "bounds": {
                "minLon": state.bbox_min_lon, "minLat": state.bbox_min_lat,
                "maxLon": state.bbox_max_lon, "maxLat": state.bbox_max_lat,
            },
            "center": [
                (state.bbox_min_lon + state.bbox_max_lon) / 2,
                (state.bbox_min_lat + state.bbox_max_lat) / 2,
            ],
            "minZoom": state.min_zoom,
            "maxZoom": state.max_zoom,
            "version": state.map_version,
        },
        "expiresAt": expires_at.isoformat(),
    }

    await job_repo.update(
        state.job_id,
        {
            "status": "PENDING_REVIEW",
            "output": output_doc,
            "progress": {
                "currentStep": "WAITING_REVIEW",
                "percent": 100,
                "steps": ["MOCK_VALIDATE", "MOCK_WORKDIR", "MOCK_OSM", "MOCK_MBTILES", "MOCK_STYLE", "MOCK_ZIP"],
            },
        },
    )
    state.final_status = "PENDING_REVIEW"
    state.percent = 100

    await log_event("MOCK_COMPLETE", "INFO", "Mock pipeline complete - ready for review")
    logger.info("Mock Map Builder pipeline complete: job_id=%s", state.job_id)
    return state


async def run_map_builder_pipeline(
    state: MapBuilderState,
    settings: Settings,
    job_repo: MapJobRepository,
    event_repo: WorkflowEventRepository,
) -> MapBuilderState:
    """Build a complete map; any missing mandatory output fails the job."""
    from .steps.build_geojson import build_geojson
    from .steps.clip_source_package import clip_source_package
    from .artifacts import fail_step, inspect_mbtiles
    from app.utils.time import hours_from_now

    if settings.map_pipeline_mode == "mock":
        return await _run_mock_pipeline(state, settings, job_repo, event_repo)

    completed = []
    steps = [("VALIDATE_INPUT", lambda: validate_input(state, settings)),
             ("PREPARE_WORKDIR", lambda: prepare_workdir(state, settings))]
    if settings.map_source_package:
        steps += [("CLIP_SOURCE_PACKAGE", lambda: clip_source_package(state, settings))]
        if state.trekking_place_id or (state.publish_target_type == "ROUTE" and state.publish_target_id):
            steps += [("BUILD_GEOJSON", lambda: build_geojson(state, settings))]
    else:
        steps += [("EXTRACT_OSM", lambda: extract_osm(state, settings)),
                  ("BUILD_MBTILES", lambda: build_mbtiles(state, settings)),
                  ("BUILD_TERRAIN", lambda: build_terrain(state, settings)),
                  ("BUILD_CONTOURS", lambda: build_contours(state, settings)),
                  ("BUILD_HILLSHADE", lambda: build_hillshade(state, settings)),
                  ("BUILD_GEOJSON", lambda: build_geojson(state, settings))]
    steps += [("BUILD_STYLE", lambda: build_style(state)),
              ("PACKAGE_ZIP", lambda: package_zip(state)),
              ("VALIDATE_ZIP", lambda: validate_output(state))]

    await event_repo.log(job_id=state.job_id, workflow_type="MAP_BUILDER",
                         event="PIPELINE_START", level="INFO",
                         message="Building real offline map data",
                         metadata={"source": "package" if settings.map_source_package else
                                   "regional-PBF+DEM" if settings.map_osm_pbf_path else "Overpass+DEM"})
    await job_repo.update(state.job_id, {"status": "PROCESSING"})
    for name, execute in steps:
        state.current_step = name
        state.update_step(name, "RUNNING")
        await job_repo.set_progress(state.job_id, {
            "currentStep": name, "percent": state.percent, "steps": state.steps})
        try:
            state = await execute()
        except Exception as exc:
            fail_step(state, name, exc)
        completed.append(name)
        state.percent = min(int(len(completed) / len(steps) * 100), 99)
        await job_repo.set_progress(state.job_id, {
            "currentStep": name, "percent": state.percent, "steps": state.steps})
        if state.final_status == "FAILED":
            await job_repo.update(state.job_id, {
                "status": "FAILED", "error": {"messages": state.errors, "stage": name}, "output": None})
            await event_repo.log(job_id=state.job_id, workflow_type="MAP_BUILDER",
                                 event="PIPELINE_FAILED", level="ERROR", message="; ".join(state.errors))
            return state
        await event_repo.log(job_id=state.job_id, workflow_type="MAP_BUILDER",
                             event=name, level="INFO", message=f"{name} complete")

    info = inspect_mbtiles(state.base_mbtiles_path, "vector")
    output_doc = {
        "artifactType": "MAP_ZIP", "tempPath": str(state.zip_path),
        "fileName": state.zip_file_name, "fileSizeBytes": state.zip_size_bytes,
        "sha256": state.zip_sha256,
        "metadata": {
            "bounds": {"minLon": state.bbox_min_lon, "minLat": state.bbox_min_lat,
                       "maxLon": state.bbox_max_lon, "maxLat": state.bbox_max_lat},
            "center": [(state.bbox_min_lon + state.bbox_max_lon) / 2,
                       (state.bbox_min_lat + state.bbox_max_lat) / 2],
            "minZoom": state.min_zoom, "maxZoom": state.max_zoom, "maxNativeZoom": info["maxzoom"],
            "version": state.map_version, "mock": False,
            "osmSource": state.osm_source,
        },
        "expiresAt": hours_from_now(settings.map_artifact_ttl_hours).isoformat(),
    }
    state.final_status, state.percent = "PENDING_REVIEW", 100
    await job_repo.update(state.job_id, {
        "status": "PENDING_REVIEW", "output": output_doc,
        "progress": {"currentStep": "WAITING_REVIEW", "percent": 100, "steps": state.steps}})
    await event_repo.log(job_id=state.job_id, workflow_type="MAP_BUILDER",
                         event="PIPELINE_COMPLETE", level="INFO", message="Complete offline map ready for review")
    return state
