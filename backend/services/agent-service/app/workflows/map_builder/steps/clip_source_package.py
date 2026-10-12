"""Cut existing MBTiles by bbox and zoom, including the legacy ba-den-v1 ZIP."""
from __future__ import annotations

import hashlib
import json
import sqlite3
import zipfile
from pathlib import Path
from contextlib import closing

from app.config import Settings
from ..artifacts import bounds_of, fail_step, inspect_mbtiles, tile_range
from ..state import MapBuilderState
from .build_geojson import write_geojson


def clip_mbtiles(source: Path, output: Path, bounds: list[float], min_zoom: int, max_zoom: int):
    """Copy only intersecting tiles; MBTiles use TMS rows, not XYZ rows."""
    with closing(sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)) as src:
        metadata = dict(src.execute("SELECT name,value FROM metadata"))
        if metadata.get("scheme", "tms") != "tms":
            raise ValueError("Source MBTiles must use TMS rows")
        with closing(sqlite3.connect(output)) as dst:
            dst.executescript("""
                CREATE TABLE metadata (name TEXT PRIMARY KEY, value TEXT);
                CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB,
                                    PRIMARY KEY (zoom_level,tile_column,tile_row));
            """)
            for zoom in range(min_zoom, max_zoom + 1):
                xmin, xmax, rmin, rmax = tile_range(bounds, zoom)
                rows = src.execute("SELECT zoom_level,tile_column,tile_row,tile_data FROM tiles "
                                   "WHERE zoom_level=? AND tile_column BETWEEN ? AND ? AND tile_row BETWEEN ? AND ?",
                                   (zoom, xmin, xmax, rmin, rmax))
                dst.executemany("INSERT INTO tiles VALUES (?,?,?,?)", rows)
            count, native_min, native_max = dst.execute(
                "SELECT count(*),min(zoom_level),max(zoom_level) FROM tiles").fetchone()
            if not count:
                raise ValueError(f"Source has no tiles covering bbox/zoom: {source.name}")
            metadata.update(bounds=",".join(map(str, bounds)), minzoom=str(native_min), maxzoom=str(native_max),
                            center=f"{(bounds[0] + bounds[2])/2},{(bounds[1] + bounds[3])/2},{native_max}")
            dst.executemany("INSERT INTO metadata VALUES (?,?)", metadata.items())
            dst.commit()


async def clip_source_package(state: MapBuilderState, settings: Settings) -> MapBuilderState:
    assert state.work_dir is not None
    try:
        with zipfile.ZipFile(settings.map_source_package) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            source_bounds = manifest["bounds"]
            bounds = bounds_of(state)
            if not (source_bounds[0] <= bounds[0] < bounds[2] <= source_bounds[2] and
                    source_bounds[1] <= bounds[1] < bounds[3] <= source_bounds[3]):
                raise ValueError("Requested bbox is outside MAP_SOURCE_PACKAGE coverage")
            names = archive.namelist()
            layer_files = {layer["id"]: layer["file"] for layer in manifest.get("layers", [])}
            for name in names:
                if name.endswith(".mbtiles"):
                    key = "hillshade" if "hillshade" in name else "contours" if "contour" in name else "base"
                    layer_files.setdefault(key, name)
            for key, suffix, kind in (("base", "", "vector"), ("contours", "-contours", "vector"),
                                      ("hillshade", "-hillshade", "raster")):
                name = layer_files.get(key)
                if not name:
                    raise ValueError(f"Source package is missing {key} MBTiles")
                data = archive.read(name)
                expected = manifest.get("sha256", {}).get(name)
                if not expected or hashlib.sha256(data).hexdigest() != expected:
                    raise ValueError(f"Source SHA-256 missing/mismatch: {name}")
                source = state.work_dir / f"source-{key}.mbtiles"
                source.write_bytes(data)
                info = inspect_mbtiles(source, kind)
                # Check metadata coverage too; manifest alone must not conceal an unrelated map.
                actual_bounds = list(map(float, info["metadata"].get("bounds", "").split(",")))
                if len(actual_bounds) != 4 or not (actual_bounds[0] <= bounds[0] < bounds[2] <= actual_bounds[2] and
                                                  actual_bounds[1] <= bounds[1] < bounds[3] <= actual_bounds[3]):
                    raise ValueError(f"MBTiles coverage is outside requested bbox: {name}")
                output = state.work_dir / f"{state.place_slug}{suffix}.mbtiles"
                clip_mbtiles(source, output, bounds, state.min_zoom, min(state.max_zoom, info["maxzoom"]))
                inspect_mbtiles(output, kind, bounds)
                setattr(state, f"{'base' if key == 'base' else key}_mbtiles_path", output)
            geojson = {}
            for key in ("routes", "milestones"):
                name = manifest.get("geojson", {}).get(key) or next(
                    (name for name in names if name.endswith(f"-{key}.geojson")), None)
                geojson[key] = json.loads(archive.read(name)) if name else {"type": "FeatureCollection", "features": []}
            write_geojson(state, geojson["routes"], geojson["milestones"])
        state.update_step("CLIP_SOURCE_PACKAGE", "DONE")
    except Exception as exc:
        fail_step(state, "CLIP_SOURCE_PACKAGE", exc)
    return state
