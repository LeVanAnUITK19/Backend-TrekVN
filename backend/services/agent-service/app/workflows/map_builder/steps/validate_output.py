"""Reject incomplete, corrupt or incompatible map packages before review/publish."""
from __future__ import annotations

import hashlib
import json
import shutil
import zipfile
from pathlib import Path
from uuid import uuid4
from contextlib import contextmanager

from ..artifacts import bounds_of, fail_step, inspect_mbtiles
from ..state import MapBuilderState


@contextmanager
def _validation_dir(parent: Path):
    # Path.mkdir's default permissions work with restricted Windows service tokens too.
    path = parent / f"validate-{uuid4().hex}"
    path.mkdir()
    try:
        yield path
    finally:
        shutil.rmtree(path)


async def validate_output(state: MapBuilderState) -> MapBuilderState:
    try:
        if not state.zip_path or not state.zip_path.is_file():
            raise ValueError("ZIP file does not exist")
        if state.zip_sha256 and hashlib.sha256(state.zip_path.read_bytes()).hexdigest() != state.zip_sha256:
            raise ValueError("ZIP SHA-256 mismatch")
        with zipfile.ZipFile(state.zip_path) as archive:
            names = archive.namelist()
            if len(names) != len(set(names)) or any(Path(n).name != n or "\\" in n for n in names):
                raise ValueError("ZIP must have unique files at root")
            manifest = json.loads(archive.read("manifest.json"))
            if not manifest.get("packageId") or manifest.get("version") != state.map_version:
                raise ValueError("manifest packageId/version mismatch")
            if manifest.get("mock"):
                raise ValueError("Mock packages cannot be published as offline maps")
            if manifest.get("bounds") != bounds_of(state):
                raise ValueError("Manifest bounds mismatch")
            if manifest.get("minZoom") != state.min_zoom or manifest.get("maxZoom") != state.max_zoom:
                raise ValueError("Manifest zoom mismatch")
            # Verify all payloads, not only checksum entries that happen to be present.
            checksums = manifest.get("sha256", {})
            for name in names:
                if name == "manifest.json":
                    continue
                if not checksums.get(name) or hashlib.sha256(archive.read(name)).hexdigest() != checksums[name]:
                    raise ValueError(f"SHA-256 missing/mismatch for {name}")
            if set(checksums) != set(names) - {"manifest.json"}:
                raise ValueError("Manifest SHA-256 entries do not match ZIP payloads")
            style = json.loads(archive.read("style.json"))
            if style.get("version") != 8 or not style.get("sources") or not style.get("layers"):
                raise ValueError("Invalid or empty MapLibre style")
            entries = manifest.get("layers", [])
            layers = {layer["id"]: layer for layer in entries}
            if set(layers) != {"base", "contours", "hillshade"} or len(entries) != 3:
                raise ValueError("Required base/contours/hillshade MBTiles layers missing")
            if len({layer["file"] for layer in entries}) != 3:
                raise ValueError("MBTiles layers must reference distinct files")
            with _validation_dir(state.zip_path.parent) as tmp:
                for key, kind in (("base", "vector"), ("contours", "vector"), ("hillshade", "raster")):
                    layer = layers[key]
                    name = layer["file"]
                    if layer.get("type") != kind or name not in names or not name.endswith(".mbtiles"):
                        raise ValueError(f"Missing/invalid MBTiles layer: {key}")
                    path = Path(tmp) / name
                    path.write_bytes(archive.read(name))
                    info = inspect_mbtiles(path, kind, bounds_of(state))
                    if key == "contours" and "contour" not in info["vector_layers"]:
                        raise ValueError("Contours source-layer must be contour")
                    if key == "base" and not info["vector_layers"].intersection(
                            {"landcover", "landuse", "water", "building", "transportation", "place", "mountain_peak"}):
                        raise ValueError("Base tiles do not use Flutter's OpenMapTiles schema")
                    if layer.get("maxNativeZoom") != info["maxzoom"]:
                        raise ValueError(f"Native zoom mismatch for {key}")
                    bound_sources = {s: cfg for s, cfg in style["sources"].items()
                                     if cfg.get("url") == f"mbtiles://{name}"}
                    if not bound_sources or not any(l.get("source") in bound_sources for l in style["layers"]):
                        raise ValueError(f"Style does not render {key}")
                    for item in style["layers"]:
                        if item.get("source") in bound_sources and kind == "vector":
                            if item.get("source-layer") not in info["vector_layers"]:
                                raise ValueError(f"Style references missing MVT source-layer: {item.get('source-layer')}")
            for key, allowed in (("routes", {"LineString", "MultiLineString"}), ("milestones", {"Point"})):
                name = manifest.get("geojson", {}).get(key)
                if not name or name not in names:
                    raise ValueError(f"Missing bundled {key} GeoJSON")
                data = json.loads(archive.read(name))
                if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
                    raise ValueError(f"Invalid {key} GeoJSON")
                for feature in data["features"]:
                    if feature.get("type") != "Feature" or feature.get("geometry", {}).get("type") not in allowed:
                        raise ValueError(f"Invalid {key} geometry")
        state.update_step("VALIDATE_ZIP", "DONE")
    except Exception as exc:
        fail_step(state, "VALIDATE_ZIP", exc)
    return state
