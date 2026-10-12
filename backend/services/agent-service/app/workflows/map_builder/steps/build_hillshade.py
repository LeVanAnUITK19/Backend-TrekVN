"""Render DEM hillshade, project it to Web Mercator and build raster MBTiles."""
from __future__ import annotations

from app.config import Settings
from app.tools.command_runner import run_command
from ..artifacts import bounds_of, fail_step, restrict_generated_mbtiles
from ..state import MapBuilderState


async def build_hillshade(state: MapBuilderState, settings: Settings) -> MapBuilderState:
    assert state.work_dir is not None
    try:
        if not state.dem_path:
            raise ValueError("Clipped DEM is required")
        shade = state.work_dir / "hillshade.tif"
        mercator = state.work_dir / "hillshade-3857.tif"
        output = state.work_dir / f"{state.place_slug}-hillshade.mbtiles"
        zoom = min(state.max_zoom, max(state.min_zoom, settings.map_hillshade_max_zoom))
        # Geographic DEM units are degrees, while elevations are metres.
        await run_command("gdaldem", "hillshade", str(state.dem_path), str(shade),
                          "-s", "111120", "-compute_edges",
                          cwd=state.work_dir, allowed_root=state.work_dir, settings=settings, timeout=180)
        resolution = 156543.03392804097 / (1 << zoom)
        await run_command("gdalwarp", "-overwrite", "-t_srs", "EPSG:3857",
                          "-te_srs", "EPSG:4326", "-te", *map(str, bounds_of(state)),
                          "-tr", str(resolution), str(resolution), "-r", "bilinear",
                          str(shade), str(mercator),
                          cwd=state.work_dir, allowed_root=state.work_dir, settings=settings, timeout=180)
        await run_command("gdal_translate", "-of", "MBTiles", "-co", "TILE_FORMAT=PNG",
                          str(mercator), str(output),
                          cwd=state.work_dir, allowed_root=state.work_dir, settings=settings, timeout=180)
        factors = [str(1 << i) for i in range(1, zoom - state.min_zoom + 1)]
        if factors:
            await run_command("gdaladdo", "-r", "average", str(output), *factors,
                              cwd=state.work_dir, allowed_root=state.work_dir, settings=settings, timeout=180)
        restrict_generated_mbtiles(output, "raster", bounds_of(state), state.min_zoom, zoom)
        state.hillshade_mbtiles_path = output
        state.update_step("BUILD_HILLSHADE", "DONE")
    except Exception as exc:
        fail_step(state, "BUILD_HILLSHADE", exc)
    return state
