"""Generate real contour MVT tiles, using Flutter's contour/ele schema."""
from __future__ import annotations

from app.config import Settings
from app.tools.command_runner import run_command
from ..artifacts import bounds_of, fail_step, restrict_generated_mbtiles
from ..state import MapBuilderState


async def build_contours(state: MapBuilderState, settings: Settings) -> MapBuilderState:
    assert state.work_dir is not None
    try:
        if not state.dem_path:
            raise ValueError("Clipped DEM is required")
        geojson = state.work_dir / "contours.geojson"
        output = state.work_dir / f"{state.place_slug}-contours.mbtiles"
        await run_command("gdal_contour", "-a", "ele", "-i", str(settings.map_contour_interval_m),
                          "-f", "GeoJSON", str(state.dem_path), str(geojson),
                          cwd=state.work_dir, allowed_root=state.work_dir, settings=settings, timeout=180)
        await run_command("ogr2ogr", "-f", "MBTiles", str(output), str(geojson), "-nln", "contour",
                          "-clipsrc", *map(str, bounds_of(state)),
                          "-dsco", f"MINZOOM={state.min_zoom}",
                          "-dsco", f"MAXZOOM={min(state.max_zoom, settings.map_native_max_zoom)}",
                          "-dsco", "BOUNDS=" + ",".join(map(str, bounds_of(state))),
                          cwd=state.work_dir, allowed_root=state.work_dir, settings=settings, timeout=600)
        info = restrict_generated_mbtiles(output, "vector", bounds_of(state), state.min_zoom,
                                          min(state.max_zoom, settings.map_native_max_zoom))
        if "contour" not in info["vector_layers"]:
            raise ValueError("Contour source-layer must be named contour")
        state.contours_mbtiles_path = output
        state.update_step("BUILD_CONTOURS", "DONE")
    except Exception as exc:
        fail_step(state, "BUILD_CONTOURS", exc)
    return state
