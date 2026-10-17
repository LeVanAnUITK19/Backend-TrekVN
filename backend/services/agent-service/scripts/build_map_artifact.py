#!/usr/bin/env python3
"""Build a local offline ZIP for review, without MongoDB, R2 or publishing."""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings
from app.workflows.map_builder.pipeline import run_map_builder_pipeline
from app.workflows.map_builder.state import MapBuilderState
from app.utils.ids import slugify


class LocalJobs:
    async def update(self, job_id, fields):
        if "status" in fields:
            print(f"{job_id}: {fields['status']}")

    async def set_progress(self, job_id, progress):
        pass


class LocalEvents:
    async def log(self, **event):
        print(f"[{event['level']}] {event['event']}: {event['message']}")


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", required=True)
    parser.add_argument("--bbox", type=float, nargs=4, metavar=("WEST", "SOUTH", "EAST", "NORTH"), required=True)
    parser.add_argument("--source-package", default="", help="Existing MBTiles ZIP to cut; empty builds from OSM+DEM")
    parser.add_argument("--osm-pbf", default="", help="Regional OSM PBF to cut instead of calling Overpass")
    parser.add_argument("--work-root", default="artifacts/local-map-build")
    parser.add_argument("--min-zoom", type=int, default=10)
    parser.add_argument("--max-zoom", type=int, default=17)
    args = parser.parse_args()
    settings = Settings(
        _env_file=None, agent_mongodb_uri="mongodb://localhost:27017", trekking_service_url="http://localhost:3003",
        trekviet_internal_token="local-artifact-only", auth_service_url="http://localhost:3001", jwt_secret="unused",
        map_pipeline_mode="full", map_source_package=args.source_package,
        map_osm_pbf_path=args.osm_pbf,
        map_work_root=str(Path(args.work_root).resolve()),
    )
    state = MapBuilderState(
        job_id="MAP-local", trekking_place_id="", place_name=args.name, place_slug=slugify(args.name),
        publish_target_type="PLACE", publish_target_id="", admin_id="local",
        bbox_min_lon=args.bbox[0], bbox_min_lat=args.bbox[1], bbox_max_lon=args.bbox[2], bbox_max_lat=args.bbox[3],
        min_zoom=args.min_zoom, max_zoom=args.max_zoom,
    )
    state = await run_map_builder_pipeline(state, settings, LocalJobs(), LocalEvents())
    if state.final_status == "FAILED":
        print(json.dumps(state.errors, ensure_ascii=True))
        return 1
    print(f"ARTIFACT: {state.zip_path}")
    print(f"SHA256: {state.zip_sha256}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
