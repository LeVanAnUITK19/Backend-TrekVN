"""Generate an offline style template using Flutter's base/contour layer schema.

mbtiles:// sources are package references; the app binds them to LocalTileServer.
GeoJSON is embedded so the style never fetches route/milestone data over the internet.
Flutter's MapStyleBuilder also adds labels using its bundled offline glyphs.
"""
from __future__ import annotations

import json

from ..artifacts import inspect_mbtiles
from ..state import MapBuilderState


def _build_style(state: MapBuilderState) -> dict:
    sources, layers = {}, [{"id": "background", "type": "background",
                           "paint": {"background-color": "#f5f0e8"}}]
    if state.base_mbtiles_path:
        info = inspect_mbtiles(state.base_mbtiles_path, "vector")
        sources["base-source"] = {"type": "vector", "url": f"mbtiles://{state.base_mbtiles_path.name}",
                                  "minzoom": info["minzoom"], "maxzoom": info["maxzoom"],
                                  "attribution": "© OpenStreetMap contributors"}
        for layer, color in (("landcover", "#c8ddb8"), ("landuse", "#e8e0d8"),
                             ("water", "#a8d0e8"), ("building", "#d8ccc0")):
            if layer in info["vector_layers"]:
                layers.append({"id": f"base-{layer}", "type": "fill", "source": "base-source",
                               "source-layer": layer, "paint": {"fill-color": color, "fill-opacity": 0.75}})
        for layer, color, width in (("waterway", "#80b8d8", 1.5),
                                     ("transportation", "#c0a878", 2), ("boundary", "#c0b0a8", 1)):
            if layer in info["vector_layers"]:
                layers.append({"id": f"base-{layer}", "type": "line", "source": "base-source",
                               "source-layer": layer, "layout": {"line-join": "round", "line-cap": "round"},
                               "paint": {"line-color": color, "line-width": width}})
    if state.hillshade_mbtiles_path:
        info = inspect_mbtiles(state.hillshade_mbtiles_path, "raster")
        sources["hillshade-source"] = {"type": "raster", "url": f"mbtiles://{state.hillshade_mbtiles_path.name}",
                                       "tileSize": 256, "minzoom": info["minzoom"], "maxzoom": info["maxzoom"]}
        layers.append({"id": "hillshade-layer", "type": "raster", "source": "hillshade-source",
                       "paint": {"raster-opacity": 0.4, "raster-contrast": 0.05}})
    if state.contours_mbtiles_path:
        info = inspect_mbtiles(state.contours_mbtiles_path, "vector")
        sources["contours-source"] = {"type": "vector", "url": f"mbtiles://{state.contours_mbtiles_path.name}",
                                      "minzoom": info["minzoom"], "maxzoom": info["maxzoom"]}
        layers.append({"id": "contours-line", "type": "line", "source": "contours-source",
                       "source-layer": "contour", "paint": {"line-color": "#a07840", "line-width": 0.8,
                                                                    "line-opacity": 0.65}})
    for key, path, kind, paint in (
        ("routes", state.routes_geojson_path, "line", {"line-color": "#E53935", "line-width": 3.5}),
        ("milestones", state.milestones_geojson_path, "circle", {"circle-color": "#207335", "circle-radius": 8,
                                                                "circle-stroke-color": "#ffffff", "circle-stroke-width": 2}),
    ):
        if path:
            sources[f"{key}-source"] = {"type": "geojson", "data": json.loads(path.read_text(encoding="utf-8"))}
            layers.append({"id": f"{key}-layer", "type": kind, "source": f"{key}-source", "paint": paint})
    return {"version": 8, "name": state.place_name,
            "metadata": {"trekviet:packageId": f"{state.place_slug}-v{state.map_version}",
                         "trekviet:version": state.map_version, "trekviet:sourceBinding": "LocalTileServer"},
            "center": [(state.bbox_min_lon + state.bbox_max_lon) / 2,
                       (state.bbox_min_lat + state.bbox_max_lat) / 2],
            "zoom": (state.min_zoom + state.max_zoom) // 2, "sources": sources, "layers": layers}


async def build_style(state: MapBuilderState) -> MapBuilderState:
    assert state.work_dir is not None
    state.style_json_path = state.work_dir / "style.json"
    state.style_json_path.write_text(json.dumps(_build_style(state), ensure_ascii=False, indent=2), encoding="utf-8")
    state.update_step("BUILD_STYLE", "DONE")
    return state
