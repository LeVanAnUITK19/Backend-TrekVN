"""Bundle real trekking routes and milestones, clipped to the map bbox."""
from __future__ import annotations

import json
import math

from app.config import Settings
from app.tools.trekking_service import TrekkingServiceClient
from ..artifacts import bounds_of, fail_step
from ..state import MapBuilderState


def _point_inside(point, bounds):
    return (len(point) >= 2 and all(math.isfinite(float(n)) for n in point) and
            bounds[0] <= point[0] <= bounds[2] and bounds[1] <= point[1] <= bounds[3])


def _clip_segment(a, b, bounds):
    dx, dy = b[0] - a[0], b[1] - a[1]
    lo, hi = 0.0, 1.0
    for p, q in ((-dx, a[0] - bounds[0]), (dx, bounds[2] - a[0]),
                 (-dy, a[1] - bounds[1]), (dy, bounds[3] - a[1])):
        if p == 0:
            if q < 0:
                return None
        else:
            t = q / p
            if p < 0:
                lo = max(lo, t)
            else:
                hi = min(hi, t)
            if lo > hi:
                return None
    # Preserve optional elevation coordinate.
    def interp(t):
        point = [a[i] + t * (b[i] - a[i]) for i in range(min(len(a), len(b)))]
        point[0] = min(bounds[2], max(bounds[0], point[0]))
        point[1] = min(bounds[3], max(bounds[1], point[1]))
        return point
    start, end = interp(lo), interp(hi)
    return (start, end) if start != end else None


def clip_geojson(collection: dict, bounds: list[float]) -> dict:
    if collection.get("type") != "FeatureCollection" or not isinstance(collection.get("features"), list):
        raise ValueError("Expected GeoJSON FeatureCollection")
    features = []
    for feature in collection["features"]:
        geometry = feature.get("geometry") or {}
        kind = geometry.get("type")
        coords = geometry.get("coordinates", [])
        if kind == "Point":
            if _point_inside(coords, bounds):
                features.append(feature)
        elif kind in ("LineString", "MultiLineString"):
            paths = [coords] if kind == "LineString" else coords
            parts = []
            for path in paths:
                current = []
                for a, b in zip(path, path[1:]):
                    segment = _clip_segment(a, b, bounds)
                    if segment:
                        start, end = segment
                        if current and current[-1] == start:
                            current.append(end)
                        else:
                            if current:
                                parts.append(current)
                            current = [start, end]
                    elif current:
                        parts.append(current)
                        current = []
                if current:
                    parts.append(current)
            if parts:
                clipped = dict(feature)
                clipped["geometry"] = {"type": "LineString" if len(parts) == 1 else "MultiLineString",
                                       "coordinates": parts[0] if len(parts) == 1 else parts}
                features.append(clipped)
        else:
            raise ValueError(f"Unsupported route/milestone geometry: {kind}")
    return {"type": "FeatureCollection", "features": features}


def write_geojson(state, routes: dict, milestones: dict):
    for key, data in (("routes", routes), ("milestones", milestones)):
        path = state.work_dir / f"{state.place_slug}-{key}.geojson"
        path.write_text(json.dumps(clip_geojson(data, bounds_of(state)), ensure_ascii=False), encoding="utf-8")
        setattr(state, f"{key}_geojson_path", path)


async def build_geojson(state: MapBuilderState, settings: Settings) -> MapBuilderState:
    try:
        client = TrekkingServiceClient(settings)
        routes, milestones = [], []
        if state.publish_target_type == "ROUTE" and state.publish_target_id:
            route = await client.get_public_route_by_id(state.publish_target_id)
            if not route:
                raise ValueError("Target route does not exist")
            route_docs = [route]
        elif state.trekking_place_id:
            route_docs = await client.get_place_routes(state.trekking_place_id)
        else:
            route_docs = []
        for route in route_docs:
            route_id = str(route.get("trekkingRouteId") or route.get("_id") or "")
            if (route.get("path") or {}).get("coordinates"):
                routes.append({"type": "Feature", "geometry": route["path"],
                               "properties": {"name": route.get("name", ""), "routeId": route_id}})
            for milestone in await client.get_route_milestones(route_id):
                milestones.append({"type": "Feature", "geometry": milestone["location"],
                                   "properties": {"name": milestone.get("name", ""),
                                                  "elevationM": milestone.get("altitude"),
                                                  "sequence": milestone.get("sequence"),
                                                  "routeId": route_id}})
        write_geojson(state, {"type": "FeatureCollection", "features": routes},
                      {"type": "FeatureCollection", "features": milestones})
        state.update_step("BUILD_GEOJSON", "DONE")
    except Exception as exc:
        fail_step(state, "BUILD_GEOJSON", exc)
    return state
