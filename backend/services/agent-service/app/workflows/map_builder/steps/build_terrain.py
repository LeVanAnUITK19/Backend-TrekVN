"""Fetch DEM tiles, mosaic and clip them to the job bbox for terrain processing."""
from __future__ import annotations

import gzip
import math
import shutil
from pathlib import Path

import httpx

from app.config import Settings
from app.tools.command_runner import run_command
from ..artifacts import bounds_of, fail_step
from ..state import MapBuilderState


def dem_tile_names(bounds: list[float]) -> list[tuple[str, str]]:
    west, south, east, north = bounds
    names = []
    for lat in range(math.floor(south), math.ceil(north)):
        latitude = f"{'N' if lat >= 0 else 'S'}{abs(lat):02d}"
        for lon in range(math.floor(west), math.ceil(east)):
            tile = f"{latitude}{'E' if lon >= 0 else 'W'}{abs(lon):03d}"
            names.append((latitude, tile))
    if len(names) > 16:
        raise ValueError("Bbox needs more than 16 DEM tiles; use a smaller bbox")
    return names


async def build_terrain(state: MapBuilderState, settings: Settings) -> MapBuilderState:
    assert state.work_dir is not None
    try:
        sources = []
        if settings.map_dem_path:
            source = Path(settings.map_dem_path)
            local = state.work_dir / source.name
            if source.resolve() != local.resolve():
                shutil.copyfile(source, local)
            sources.append(local)
        else:
            async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
                for latitude, tile in dem_tile_names(bounds_of(state)):
                    url = settings.map_dem_url_template.format(lat=latitude, tile=tile)
                    response = await client.get(url)
                    response.raise_for_status()
                    data = gzip.decompress(response.content)
                    if len(data) not in (1201 * 1201 * 2, 3601 * 3601 * 2):
                        raise ValueError(f"Invalid HGT size for {tile}")
                    source = state.work_dir / f"{tile}.hgt"
                    source.write_bytes(data)
                    sources.append(source)
        mosaic = state.work_dir / "dem.vrt"
        dem = state.work_dir / f"{state.place_slug}-dem.tif"
        await run_command("gdalbuildvrt", str(mosaic), *map(str, sources),
                          cwd=state.work_dir, allowed_root=state.work_dir, settings=settings, timeout=120)
        await run_command("gdalwarp", "-overwrite", "-t_srs", "EPSG:4326", "-te_srs", "EPSG:4326",
                          "-te", *map(str, bounds_of(state)), "-dstnodata", "-32768",
                          "-r", "bilinear", str(mosaic), str(dem),
                          cwd=state.work_dir, allowed_root=state.work_dir, settings=settings, timeout=180)
        if not dem.is_file() or dem.stat().st_size == 0:
            raise ValueError("GDAL produced no clipped DEM")
        state.dem_path = dem
        state.update_step("BUILD_TERRAIN", "DONE")
    except Exception as exc:
        fail_step(state, "BUILD_TERRAIN", exc)
    return state
