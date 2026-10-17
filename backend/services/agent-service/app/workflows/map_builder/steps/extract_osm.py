"""
Step: extract OSM data for the bbox.

Uses osmium-tool (osmium extract) or falls back to the Overpass API
to download a PBF/XML for the target bbox.

Command injection protection:
- All parameters are passed as separate args (no shell=True)
- bbox values are validated floats before this step runs
"""

from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from xml.etree import ElementTree

import httpx

from app.config import Settings
from app.tools.command_runner import CommandError, run_command

from ..state import MapBuilderState
from ..artifacts import bounds_of

logger = logging.getLogger(__name__)

# Overpass query body — sent as plain text (not form-encoded)
# Overpass API hiện tại yêu cầu Content-Type: text/plain hoặc application/x-www-form-urlencoded
# nhưng một số instance trả 406 khi nhận x-www-form-urlencoded → dùng plain text POST
_OVERPASS_EXPORT_TEMPLATE = (
    "[out:xml][timeout:120];"
    "(node({minLat},{minLon},{maxLat},{maxLon});"
    "way({minLat},{minLon},{maxLat},{maxLon});"
    "relation({minLat},{minLon},{maxLat},{maxLon}););"
    "(._;>;);"
    "out body;"
)

# Fallback Overpass mirrors — thử lần lượt nếu mirror trước thất bại
_OVERPASS_FALLBACK_MIRRORS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

_USER_AGENT = "TrekVN-MapBuilder/1.0 (+https://trekviet.vn)"


async def extract_osm(state: MapBuilderState, settings: Settings) -> MapBuilderState:
    """
    Prefer a configured regional PBF, then use Overpass when no PBF is configured.
    """
    assert state.work_dir is not None

    osm_out = state.work_dir / f"{state.place_slug}.osm.xml"

    try:
        if settings.map_osm_pbf_path:
            await _extract_regional_pbf(state, settings)
            state.update_step("EXTRACT_OSM", "DONE")
            return state

        await _download_from_overpass(state, settings, osm_out)
        state.osm_pbf_path = osm_out  # Using xml as our "pbf" for simplicity

        # Convert to PBF if osmium is available (smaller file, faster processing)
        if state.osmium_available:
            pbf_out = state.work_dir / f"{state.place_slug}.osm.pbf"
            try:
                await run_command(
                    "osmium", "cat",
                    str(osm_out),
                    "--output", str(pbf_out),
                    "--overwrite",
                    cwd=state.work_dir,
                    allowed_root=state.work_dir,
                    settings=settings,
                    timeout=120,
                )
                state.osm_pbf_path = pbf_out
            except CommandError as exc:
                raise RuntimeError(f"OSM XML → PBF conversion failed: {exc}") from exc

        state.osm_source = {"type": "overpass"}

        state.update_step("EXTRACT_OSM", "DONE")

    except Exception as exc:
        logger.error("OSM extract failed: %s", exc)
        state.errors.append(f"OSM extract failed: {exc}")
        state.update_step("EXTRACT_OSM", "FAILED", str(exc))
        state.final_status = "FAILED"

    return state


def _source_bounds_contain(boxes: list, bounds: list[float]) -> bool:
    for box in boxes:
        if not isinstance(box, list) or len(box) != 4:
            continue
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in box):
            continue
        if box[0] <= bounds[0] < bounds[2] <= box[2] and box[1] <= bounds[1] < bounds[3] <= box[3]:
            return True
    return False


async def _extract_regional_pbf(state: MapBuilderState, settings: Settings) -> None:
    source = Path(settings.map_osm_pbf_path).resolve()
    stdout, _ = await run_command("osmium", "fileinfo", "--json", str(source),
                                 cwd=state.work_dir, allowed_root=state.work_dir,
                                 settings=settings, read_only_input=source, timeout=60)
    header = json.loads(stdout).get("header") or {}
    if header.get("with_history"):
        raise ValueError("MAP_OSM_PBF_PATH must contain a current OSM snapshot, not history")
    if not _source_bounds_contain(header.get("boxes") or [], bounds_of(state)):
        raise ValueError("Requested BBOX is outside the regional OSM PBF header bounds, or source bounds are missing")
    output = state.work_dir / f"{state.place_slug}.osm.pbf"
    # smart includes complete ways and multipolygon members needed by Tilemaker.
    # Only the small extract is written into the job directory.
    await run_command("osmium", "extract", "--bbox", ",".join(map(str, bounds_of(state))),
                      "--strategy", "smart", "--set-bounds", "--output", str(output),
                      "--overwrite", str(source), cwd=state.work_dir, allowed_root=state.work_dir,
                      settings=settings, read_only_input=source, timeout=600)
    if not output.is_file() or output.stat().st_size == 0:
        raise ValueError("osmium produced no regional OSM extract")
    state.osm_pbf_path = output
    options = header.get("option") or {}
    state.osm_source = {"type": "regional-pbf", "file": source.name,
                        "timestamp": options.get("osmosis_replication_timestamp") or options.get("timestamp")}
    logger.info("Regional PBF extracted: %s -> %s (%d bytes)", source.name, output.name, output.stat().st_size)


async def _download_from_overpass(
    state: MapBuilderState, settings: Settings, output_path: Path
) -> None:
    """
    Download raw OSM XML from Overpass API for the bbox.

    Thử primary URL trước, sau đó fallback sang các mirror nếu:
    - HTTP 406 (Not Acceptable) — server reject Content-Type
    - HTTP 429 (Too Many Requests) — rate limit
    - HTTP 5xx — server error
    - Connection timeout / network error

    Dùng POST với Content-Type: text/plain (tránh 406 từ một số instances).
    """
    query = _OVERPASS_EXPORT_TEMPLATE.format(
        minLat=state.bbox_min_lat,
        minLon=state.bbox_min_lon,
        maxLat=state.bbox_max_lat,
        maxLon=state.bbox_max_lon,
    )

    logger.info(
        "Overpass bbox download: [%.4f,%.4f,%.4f,%.4f]",
        state.bbox_min_lat, state.bbox_min_lon,
        state.bbox_max_lat, state.bbox_max_lon,
    )

    # Danh sách endpoints thử theo thứ tự: primary → fallbacks
    endpoints = [settings.osm_overpass_url] + _OVERPASS_FALLBACK_MIRRORS
    last_error: Exception | None = None

    for i, endpoint in enumerate(endpoints):
        label = "primary" if i == 0 else f"mirror-{i}"
        try:
            content = await _try_overpass_endpoint(endpoint, query, label)
            output_path.write_bytes(content)
            logger.info("OSM data saved: %s (%d bytes) via %s", output_path.name, len(content), label)
            return
        except Exception as exc:
            logger.warning("Overpass %s failed (%s): %s", label, endpoint, exc)
            last_error = exc

    # Tất cả endpoints đều thất bại
    raise RuntimeError(
        "Các máy chủ Overpass hiện không tải được dữ liệu OSM. "
        "Cấu hình MAP_OSM_PBF_PATH tới nguồn PBF khu vực để cắt cục bộ, hoặc thử lại sau. "
        f"Chi tiết: {last_error}"
    )


async def _try_overpass_endpoint(endpoint: str, query: str, label: str) -> bytes:
    """
    Thử một Overpass endpoint. Raise RuntimeError nếu thất bại.

    Thử 2 cách gửi request:
    1. POST với Content-Type: text/plain (body = query string trực tiếp)
    2. POST với Content-Type: application/x-www-form-urlencoded (body = data=<query>)
    """
    headers_plain = {
        "Content-Type": "text/plain; charset=utf-8",
        "Accept": "application/xml, text/xml, */*",
        "User-Agent": _USER_AGENT,
    }
    headers_form = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/xml, text/xml, */*",
        "User-Agent": _USER_AGENT,
    }

    async with httpx.AsyncClient(timeout=130.0) as client:
        # Cách 1: POST plain text (query trực tiếp trong body)
        resp = await client.post(endpoint, content=query.encode("utf-8"), headers=headers_plain)

        # Nếu 406 → thử form-encoded
        if resp.status_code == 406:
            logger.debug("Overpass %s returned 406 for plain text — retrying with form-encoded", label)
            resp = await client.post(
                endpoint,
                data={"data": query},
                headers=headers_form,
            )

        if not resp.is_success:
            raise RuntimeError(f"Overpass {label} returned HTTP {resp.status_code}")

        content = resp.content
        _validate_osm_xml(content, label)
        return content


def _validate_osm_xml(content: bytes, label: str) -> None:
    try:
        root = ElementTree.fromstring(content)
    except ElementTree.ParseError as exc:
        raise RuntimeError(f"Overpass {label} returned invalid OSM XML") from exc
    if root.tag != "osm":
        raise RuntimeError(f"Overpass {label} returned a non-OSM document")
    if root.find("remark") is not None:
        raise RuntimeError(f"Overpass {label} query failed: {(root.findtext('remark') or '').strip()[:200]}")
    if not any(child.tag in ("node", "way", "relation") for child in root):
        raise RuntimeError(f"Overpass {label} returned no OSM objects in the BBOX")
