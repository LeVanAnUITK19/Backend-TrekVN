"""Build OSM tiles with the OpenMapTiles layer names used by Flutter."""
from __future__ import annotations

import json

from app.config import Settings
from app.tools.command_runner import run_command
from ..artifacts import bounds_of, fail_step, inspect_mbtiles
from ..state import MapBuilderState

_TILEMAKER_PROCESS_LUA = """
node_keys = { "natural", "place", "tourism" }
function init_function() end
function exit_function() end
function names()
  Attribute("name", Find("name"))
  Attribute("name:latin", Find("name:en") ~= "" and Find("name:en") or Find("name"))
end
function node_function()
  if Find("natural") == "peak" then
    Layer("mountain_peak", false)
    names()
    AttributeNumeric("ele", tonumber(Find("ele")) or 0)
  end
  if Find("place") ~= "" then
    Layer("place", false)
    names()
    Attribute("class", Find("place"))
    AttributeNumeric("rank", 10)
  end
end
function way_function()
  local highway, waterway = Find("highway"), Find("waterway")
  local natural, landuse = Find("natural"), Find("landuse")
  local trail = highway == "footway" or highway == "bridleway" or highway == "steps"
  if highway ~= "" then
    Layer("transportation", false)
    Attribute("class", trail and "path" or highway)
    Attribute("surface", Find("surface"))
    if Find("name") ~= "" or Find("ref") ~= "" then
      Layer("transportation_name", false)
      names()
      Attribute("ref", Find("ref"))
    end
  end
  if waterway ~= "" then
    Layer("waterway", false)
    Attribute("class", waterway)
    names()
  end
  if natural == "water" or landuse == "reservoir" then
    Layer("water", true)
    Attribute("class", "lake")
  end
  if natural == "wood" or landuse == "forest" or natural == "scrub" or
     natural == "grassland" or landuse == "meadow" or landuse == "farmland" then
    Layer("landcover", true)
    local class = natural
    if natural == "wood" or landuse == "forest" then class = "wood"
    elseif natural == "grassland" or landuse == "meadow" then class = "grass"
    elseif landuse == "farmland" then class = "farmland" end
    Attribute("class", class)
  end
  if landuse ~= "" or Find("leisure") == "park" then
    Layer("landuse", true)
    Attribute("class", Find("leisure") == "park" and "park" or landuse)
  end
  if Find("building") ~= "" and Find("building") ~= "no" then
    Layer("building", true)
  end
  if Find("boundary") == "administrative" then
    Layer("boundary", false)
    AttributeNumeric("admin_level", tonumber(Find("admin_level")) or 0)
  end
end
"""


async def build_mbtiles(state: MapBuilderState, settings: Settings) -> MapBuilderState:
    assert state.work_dir is not None
    try:
        if not state.tilemaker_available:
            raise ValueError("tilemaker is required; cannot create an offline map without base tiles")
        if not state.osm_pbf_path or state.osm_pbf_path.suffix != ".pbf":
            raise ValueError("OSM PBF input is required (install osmium)")
        native_zoom = min(state.max_zoom, settings.map_native_max_zoom)
        process = state.work_dir / "process.lua"
        config = state.work_dir / "config.json"
        output = state.work_dir / f"{state.place_slug}.mbtiles"
        process.write_text(_TILEMAKER_PROCESS_LUA, encoding="utf-8")
        names = ("landcover", "landuse", "water", "building", "waterway", "transportation",
                 "transportation_name", "boundary", "place", "mountain_peak")
        config.write_text(json.dumps({
            "settings": {
                "minzoom": state.min_zoom, "maxzoom": native_zoom, "basezoom": native_zoom,
                "include_ids": False, "compress": "gzip", "combine_below": native_zoom,
                "name": state.place_name, "version": str(state.map_version),
                "description": "TrekVN offline OSM map", "bounding_box": bounds_of(state),
                "metadata": {"attribution": "© OpenStreetMap contributors"},
            },
            "layers": {name: {"minzoom": state.min_zoom, "maxzoom": native_zoom} for name in names},
        }), encoding="utf-8")
        await run_command("tilemaker", "--input", str(state.osm_pbf_path), "--output", str(output),
                          "--config", str(config), "--process", str(process),
                          cwd=state.work_dir, allowed_root=state.work_dir, settings=settings, timeout=600)
        inspect_mbtiles(output, "vector", bounds_of(state))
        state.base_mbtiles_path = output
        state.update_step("BUILD_MBTILES", "DONE")
    except Exception as exc:
        fail_step(state, "BUILD_MBTILES", exc)
    return state
