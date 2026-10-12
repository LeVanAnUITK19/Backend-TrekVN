"""Test trekking-service authentication and offline-map endpoint."""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env", override=True)


async def main() -> None:
    import httpx

    token = os.environ["TREKVIET_INTERNAL_TOKEN"]
    base = os.environ.get("TREKKING_SERVICE_URL", "http://localhost:3003")
    place_id = "6ac604e085a8ecf3251bb7bf"  # from job MAP-20261007-86443752

    headers = {
        "X-Service-Token": token,
        "Content-Type": "application/json",
    }
    payload = {
        "available": True,
        "version": 1,
        "objectKey": "maps/nui-chua-chan/v1/nui-chua-chan-v1-flutter.zip",
        "sizeBytes": 689,
        "checksum": "2da37776e2d5a1dd96c7c487",
        "minZoom": 10,
        "maxZoom": 14,
        "bounds": {
            "minLon": 107.353, "minLat": 10.914,
            "maxLon": 107.399, "maxLat": 10.963,
        },
    }

    async with httpx.AsyncClient(timeout=8.0) as c:
        # 1. Health check
        r = await c.get(f"{base}/health")
        print(f"[1] Health: {r.status_code} {r.text[:60]}")

        # 2. Test offline-map PUT with valid place ID
        r2 = await c.put(
            f"{base}/api/v1/admin/trekking/places/{place_id}/offline-map",
            headers=headers,
            json=payload,
        )
        print(f"[2] offline-map PUT: {r2.status_code}")
        print(f"    response: {r2.text[:300]}")

        # 3. Test with wrong token to confirm auth works
        bad_headers = {"X-Service-Token": "wrong-token", "Content-Type": "application/json"}
        r3 = await c.put(
            f"{base}/api/v1/admin/trekking/places/{place_id}/offline-map",
            headers=bad_headers,
            json=payload,
        )
        print(f"[3] Wrong token: {r3.status_code} (expected 401)")


if __name__ == "__main__":
    asyncio.run(main())
