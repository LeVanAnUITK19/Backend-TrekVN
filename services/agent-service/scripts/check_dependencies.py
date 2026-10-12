#!/usr/bin/env python3
"""Check the map tool runtime selected by .env, without database/service calls."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Settings
from app.tools.map_tool_runtime import MAP_TOOLS, check_map_tools, resolve_backend


async def check() -> int:
    # Required service settings are irrelevant to checking local binaries.
    # Read map runtime settings from .env, but never connect to any service.
    settings = Settings(agent_mongodb_uri="mongodb://localhost:27017",
                        trekking_service_url="http://localhost:3003",
                        trekviet_internal_token="dependency-check",
                        auth_service_url="http://localhost:3001",
                        jwt_secret="dependency-check")
    print(f"TrekViet map tools runtime: {resolve_backend(settings)}")
    try:
        missing, _ = await check_map_tools(settings)
    except Exception as exc:
        print(str(exc))
        return 1
    for tool in MAP_TOOLS:
        print(f"  {'MISSING' if tool in missing else 'OK':7} {tool}")
    if missing:
        print("Build the map tools Docker image or configure MAP_SOURCE_PACKAGE.")
        return 1
    print("All required map tools are available.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(check()))
