"""Inspect MBTiles databases, tile payloads and native zoom levels."""
from __future__ import annotations

import gzip
import json
import logging
import math
import sqlite3
from pathlib import Path
from contextlib import closing

logger = logging.getLogger(__name__)


def bounds_of(state) -> list[float]:
    return [state.bbox_min_lon, state.bbox_min_lat, state.bbox_max_lon, state.bbox_max_lat]


def fail_step(state, step: str, exc: Exception | str):
    message = f"{step}: {exc}"
    state.errors.append(message)
    state.final_status = "FAILED"
    state.update_step(step, "FAILED", message)
    return state


def tile_range(bounds: list[float], zoom: int) -> tuple[int, int, int, int]:
    """Inclusive columns and TMS rows intersecting WGS84 bounds."""
    west, south, east, north = bounds
    size = 1 << zoom

    def x(lon):
        return (lon + 180) / 360 * size

    def y(lat):
        return (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * size

    xmin = max(0, min(size - 1, math.floor(x(west))))
    xmax = max(0, min(size - 1, math.ceil(x(east)) - 1))
    ymin = max(0, min(size - 1, math.floor(y(north))))
    ymax = max(0, min(size - 1, math.ceil(y(south)) - 1))
    return xmin, xmax, size - 1 - ymax, size - 1 - ymin


def _varint(data: bytes, offset: int) -> tuple[int, int]:
    value = 0
    for shift in range(0, 70, 7):
        if offset >= len(data):
            raise ValueError("Truncated MVT varint")
        byte = data[offset]
        offset += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, offset
    raise ValueError("Invalid MVT varint")


def _fields(data: bytes):
    offset = 0
    while offset < len(data):
        key, offset = _varint(data, offset)
        field, wire = key >> 3, key & 7
        if not field:
            raise ValueError("Invalid MVT field")
        if wire == 0:
            value, offset = _varint(data, offset)
        elif wire == 2:
            length, offset = _varint(data, offset)
            value = data[offset:offset + length]
            offset += length
        elif wire in (1, 5):
            length = 8 if wire == 1 else 4
            value = data[offset:offset + length]
            offset += length
        else:
            raise ValueError("Unsupported MVT wire type")
        if offset > len(data):
            raise ValueError("Truncated MVT field")
        yield field, value


def vector_tile_layers(data: bytes) -> set[str]:
    if data.startswith(b"\x1f\x8b"):
        data = gzip.decompress(data)
    names = set()
    for field, layer in _fields(data):
        if field == 3 and isinstance(layer, bytes):
            fields = list(_fields(layer))
            name = next((v.decode("utf-8") for k, v in fields if k == 1), "")
            if name and any(k == 2 for k, _ in fields):
                names.add(name)
    return names


def inspect_mbtiles(path: Path, kind: str, bounds: list[float] | None = None) -> dict:
    with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)) as db:
        if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise ValueError(f"Corrupt SQLite: {path.name}")
        metadata = dict(db.execute("SELECT name, value FROM metadata"))
        count, minzoom, maxzoom = db.execute(
            "SELECT count(*), min(zoom_level), max(zoom_level) FROM tiles"
        ).fetchone()
        if not count:
            raise ValueError(f"No tiles in {path.name}")
        fmt = metadata.get("format", "").lower()
        if kind == "vector" and fmt not in ("pbf", "mvt"):
            raise ValueError(f"Expected vector MBTiles: {path.name}")
        if kind == "raster" and fmt not in ("png", "jpg", "jpeg", "webp"):
            raise ValueError(f"Expected raster MBTiles: {path.name}")
        declared_layers = set()
        if kind == "vector":
            declared_layers = {l["id"] for l in json.loads(metadata.get("json", "{}"))
                               .get("vector_layers", [])}
            if not declared_layers:
                raise ValueError(f"Missing vector_layers metadata: {path.name}")
        has_vector_features = False
        for zoom, col, row, data in db.execute(
                "SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles"):
            if not (0 <= zoom <= 22 and 0 <= col < (1 << zoom) and 0 <= row < (1 << zoom)):
                raise ValueError(f"Invalid tile coordinates: {path.name}")
            if bounds:
                xmin, xmax, rmin, rmax = tile_range(bounds, zoom)
                if not (xmin <= col <= xmax and rmin <= row <= rmax):
                    raise ValueError(f"Tile outside requested bounds: {path.name}")
            if kind == "vector":
                payload_layers = vector_tile_layers(data)
                has_vector_features |= bool(payload_layers)
                if not payload_layers.issubset(declared_layers):
                    raise ValueError(f"MVT layer missing from metadata: {path.name}")
            elif not (data.startswith(b"\x89PNG\r\n\x1a\n") or data.startswith(b"\xff\xd8") or
                      (data.startswith(b"RIFF") and data[8:12] == b"WEBP")):
                raise ValueError(f"Invalid raster tile payload: {path.name}")
        if kind == "vector" and not has_vector_features:
            raise ValueError(f"Vector MBTiles contain no features: {path.name}")
        return {"count": count, "minzoom": minzoom, "maxzoom": maxzoom,
                "metadata": metadata, "vector_layers": declared_layers}


def restrict_generated_mbtiles(path: Path, kind: str, bounds: list[float],
                               min_zoom: int, max_zoom: int) -> dict:
    """Keep only tiles intersecting the job bbox, after GDAL adds tile buffers.

    BOUNDS is metadata for vector output; it does not restrict tile coordinates.
    Validate the generated payload first, retain buffers inside surviving tiles,
    then enforce the same inclusive TMS range used by the final ZIP validator.
    """
    original = inspect_mbtiles(path, kind)
    if original["metadata"].get("scheme", "tms") != "tms":
        raise ValueError("Generated MBTiles must use TMS rows")
    with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=rw", uri=True)) as db:
        with db:
            db.execute("DELETE FROM tiles WHERE zoom_level < ? OR zoom_level > ?", (min_zoom, max_zoom))
            zooms = [row[0] for row in db.execute("SELECT DISTINCT zoom_level FROM tiles")]
            for zoom in zooms:
                xmin, xmax, rmin, rmax = tile_range(bounds, zoom)
                db.execute("DELETE FROM tiles WHERE zoom_level = ? AND "
                           "(tile_column < ? OR tile_column > ? OR tile_row < ? OR tile_row > ?)",
                           (zoom, xmin, xmax, rmin, rmax))
            count, native_min, native_max = db.execute(
                "SELECT count(*),min(zoom_level),max(zoom_level) FROM tiles").fetchone()
            if not count:
                raise ValueError(f"No generated tiles intersect requested bbox/zoom: {path.name}")
            # GDAL's metadata table does not require a UNIQUE constraint on name.
            updates = {"bounds": ",".join(map(str, bounds)), "minzoom": str(native_min),
                       "maxzoom": str(native_max), "scheme": "tms",
                       "center": f"{(bounds[0] + bounds[2])/2},{(bounds[1] + bounds[3])/2},{native_max}"}
            for name, value in updates.items():
                db.execute("DELETE FROM metadata WHERE name=?", (name,))
                db.execute("INSERT INTO metadata(name,value) VALUES (?,?)", (name, value))
    result = inspect_mbtiles(path, kind, bounds)
    result["discarded_tiles"] = original["count"] - result["count"]
    logger.info("MBTiles %s: %d tiles kept, %d tiles removed outside requested bbox/zoom",
                path.name, result["count"], result["discarded_tiles"])
    return result
