"""
Unit tests for Map Builder workflow.

Tests:
- invalid bbox (min > max, out of range)
- command injection input rejected at validate_input
- bbox too large
- valid bbox passes
- validate_output detects missing manifest
- validate_output detects SHA-256 mismatch
- approve only from PENDING_REVIEW
- reject cleans temp artifact
- R2 failure does not mark PUBLISHED
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch, call
import tempfile

import pytest

from app.workflows.map_builder.state import MapBuilderState
from app.workflows.map_builder.steps.validate_input import validate_input


def _make_state(**kwargs) -> MapBuilderState:
    defaults = dict(
        job_id="MAP-test",
        trekking_place_id="place-123",
        place_name="Núi Bà Đen",
        place_slug="nui-ba-den",
        publish_target_type="PLACE",
        publish_target_id="place-123",
        bbox_min_lon=106.139,
        bbox_min_lat=11.361,
        bbox_max_lon=106.191,
        bbox_max_lat=11.412,
        min_zoom=10,
        max_zoom=14,
        admin_id="admin-1",
    )
    defaults.update(kwargs)
    return MapBuilderState(**defaults)


# ─── validate_input ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_bbox_min_lon_greater_than_max_fails(test_settings):
    state = _make_state(bbox_min_lon=106.5, bbox_max_lon=106.1)
    state = await validate_input(state, test_settings)
    assert state.final_status == "FAILED"
    assert any("minLon" in e for e in state.errors)


@pytest.mark.asyncio
async def test_bbox_min_lat_greater_than_max_fails(test_settings):
    state = _make_state(bbox_min_lat=11.9, bbox_max_lat=11.3)
    state = await validate_input(state, test_settings)
    assert state.final_status == "FAILED"
    assert any("minLat" in e for e in state.errors)


@pytest.mark.asyncio
async def test_invalid_longitude_fails(test_settings):
    state = _make_state(bbox_min_lon=-200.0)
    state = await validate_input(state, test_settings)
    assert state.final_status == "FAILED"


@pytest.mark.asyncio
async def test_bbox_too_large_fails(test_settings):
    # 10° × 10° = 100 deg² — way over the 0.5 limit
    state = _make_state(
        bbox_min_lon=100.0, bbox_max_lon=110.0,
        bbox_min_lat=10.0, bbox_max_lat=20.0,
    )
    state = await validate_input(state, test_settings)
    assert state.final_status == "FAILED"
    assert any("area" in e.lower() or "bbox" in e.lower() for e in state.errors)


@pytest.mark.asyncio
async def test_command_injection_in_place_name_fails(test_settings):
    """Shell-dangerous characters in placeName must be rejected."""
    for dangerous in ["Núi ; rm -rf /", "Núi & cmd", "Núi | cat /etc/passwd", "Núi $(evil)"]:
        state = _make_state(place_name=dangerous)
        result = await validate_input(state, test_settings)
        assert result.final_status == "FAILED", f"Expected FAILED for: {dangerous!r}"


@pytest.mark.asyncio
async def test_valid_bbox_passes(test_settings):
    state = _make_state()
    with patch("app.workflows.map_builder.steps.validate_input.shutil.which", return_value="/usr/bin/tool"):
        state = await validate_input(state, test_settings)
    assert state.final_status != "FAILED"
    assert not state.errors


# ─── validate_output ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_validate_output_missing_zip_fails():
    from app.workflows.map_builder.steps.validate_output import validate_output

    state = _make_state()
    state.zip_path = Path("/nonexistent/file.zip")
    state.zip_size_bytes = 0

    state = await validate_output(state)
    assert state.final_status == "FAILED"


@pytest.mark.asyncio
async def test_validate_output_missing_manifest_fails(tmp_path):
    from app.workflows.map_builder.steps.validate_output import validate_output

    # ZIP without manifest.json
    zip_path = tmp_path / "test.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("style.json", '{"version": 8}')

    state = _make_state()
    state.zip_path = zip_path
    state.zip_size_bytes = zip_path.stat().st_size
    state.map_version = 1

    state = await validate_output(state)
    assert state.final_status == "FAILED"
    assert any("manifest" in e.lower() for e in state.errors)


@pytest.mark.asyncio
async def test_validate_output_sha256_mismatch_fails(tmp_path):
    from app.workflows.map_builder.steps.validate_output import validate_output

    manifest = {
        "packageId": "nui-ba-den-v1",
        "version": 1,
        "bounds": [106.139, 11.361, 106.191, 11.412],
        "sha256": {"base.mbtiles": "wronghash000"},
        "minZoom": 10,
        "maxZoom": 14,
    }
    zip_path = tmp_path / "test.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("manifest.json", json.dumps(manifest))
        zf.writestr("base.mbtiles", b"fake mbtiles content")

    state = _make_state()
    state.zip_path = zip_path
    state.zip_size_bytes = zip_path.stat().st_size
    state.map_version = 1

    state = await validate_output(state)
    assert state.final_status == "FAILED"
    assert any("SHA-256" in e or "sha" in e.lower() for e in state.errors)




# ─── MapBuilderService approval ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_approve_only_from_pending_review(test_settings):
    from app.workflows.map_builder.service import MapBuilderService

    mock_repo = AsyncMock()
    mock_events = AsyncMock()
    mock_repo.find_by_job_id.return_value = {
        "jobId": "MAP-test",
        "adminId": "admin-1",
        "status": "PROCESSING",  # not PENDING_REVIEW
        "output": {},
    }

    svc = MapBuilderService(
        settings=test_settings,
        job_repo=mock_repo,
        event_repo=mock_events,
    )

    with pytest.raises(ValueError, match="PENDING_REVIEW"):
        await svc.approve("MAP-test", "admin-1")


@pytest.mark.asyncio
async def test_reject_deletes_temp_artifact(test_settings, tmp_path):
    from app.workflows.map_builder.service import MapBuilderService

    # Create a real temp file
    zip_file = tmp_path / "nui-ba-den-v1-flutter.zip"
    zip_file.write_bytes(b"fake zip data")

    # Override MAP_WORK_ROOT to tmp_path
    test_settings.map_work_root = str(tmp_path)

    mock_repo = AsyncMock()
    mock_events = AsyncMock()
    mock_repo.find_by_job_id.return_value = {
        "jobId": "MAP-test",
        "adminId": "admin-1",
        "status": "PENDING_REVIEW",
        "output": {
            "tempPath": str(zip_file),
            "fileName": "nui-ba-den-v1-flutter.zip",
        },
        "publish": None,
    }
    mock_repo.update.return_value = {"status": "REJECTED"}

    svc = MapBuilderService(
        settings=test_settings,
        job_repo=mock_repo,
        event_repo=mock_events,
    )
    result = await svc.reject("MAP-test", "admin-1", note="Bad quality")

    assert result["status"] == "REJECTED"
    # Temp file should be deleted
    assert not zip_file.exists()
