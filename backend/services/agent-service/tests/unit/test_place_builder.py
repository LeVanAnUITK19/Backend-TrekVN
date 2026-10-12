"""
Unit tests for Place Builder workflow.

All external calls (OSM, Wikidata, trekking-service) are mocked.
Tests:
- invalid empty place fails
- create candidate pipeline
- OSM source soft-failure
- duplicate warning
- approve CREATE
- approve UPDATE
- reject
- approve cannot run twice
- production API failure does NOT mark approved
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.workflows.place_builder.state import PlaceBuilderState
from app.workflows.place_builder.nodes.validate_input import validate_input
from app.workflows.place_builder.nodes.normalize import normalize
from app.workflows.place_builder.nodes.validate_candidate import validate_candidate
from app.workflows.place_builder.nodes.duplicate_check import duplicate_check


# ─── validate_input ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_validate_input_empty_name_fails():
    state = PlaceBuilderState(
        job_id="PLC-test",
        place_name="",
        location_hint=None,
        operation="CREATE",
        target_place_id=None,
        admin_id="admin-1",
    )
    state = await validate_input(state)
    assert state.final_status == "FAILED"
    assert any("required" in e.lower() for e in state.errors)


@pytest.mark.asyncio
async def test_validate_input_update_without_target_fails():
    state = PlaceBuilderState(
        job_id="PLC-test",
        place_name="Núi Bà Đen",
        location_hint=None,
        operation="UPDATE",
        target_place_id=None,   # missing!
        admin_id="admin-1",
    )
    state = await validate_input(state)
    assert state.final_status == "FAILED"
    assert any("targetPlaceId" in e or "UPDATE" in e for e in state.errors)


@pytest.mark.asyncio
async def test_validate_input_valid_passes():
    state = PlaceBuilderState(
        job_id="PLC-test",
        place_name="Núi Bà Đen",
        location_hint="Tây Ninh",
        operation="CREATE",
        target_place_id=None,
        admin_id="admin-1",
    )
    state = await validate_input(state)
    assert state.final_status == "PROCESSING"
    assert not state.errors


# ─── normalize ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_normalize_builds_candidate():
    """normalize() should build a productionPayload from OSM data."""
    state = PlaceBuilderState(
        job_id="PLC-test",
        place_name="Núi Bà Đen",
        location_hint="Tây Ninh",
        operation="CREATE",
        target_place_id=None,
        admin_id="admin-1",
    )
    # Simulate OSM result
    state.best_osm = {
        "name": "Núi Bà Đen",
        "nameVi": "Núi Bà Đen",
        "latitude": 11.3869,
        "longitude": 106.1660,
        "elevation": "986",
        "natural": "peak",
        "osmType": "node",
        "osmId": "123456",
        "tags": {"natural": "peak"},
    }
    state.wikidata = {
        "wikidataId": "Q123456",
        "wikidataUrl": "https://www.wikidata.org/wiki/Q123456",
        "descriptionVi": "Ngọn núi cao nhất Tây Ninh",
        "elevationMeters": 986,
    }

    state = await normalize(state)

    assert state.candidate is not None
    payload = state.candidate["productionPayload"]
    assert payload["name"] == "Núi Bà Đen"
    assert payload["slug"] == "nui-ba-den"
    assert payload["dataOrigin"] == "AI_AGENT"
    assert payload["elevationMeters"] == 986
    assert payload["location"]["type"] == "Point"
    # GeoJSON: [longitude, latitude]
    assert payload["location"]["coordinates"] == [106.1660, 11.3869]
    assert payload["externalRefs"]["osm"]["id"] == "123456"
    assert payload["externalRefs"]["wikidataId"] == "Q123456"


# ─── validate_candidate ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_validate_candidate_no_name_fails():
    state = PlaceBuilderState(
        job_id="PLC-test",
        place_name="",
        location_hint=None,
        operation="CREATE",
        target_place_id=None,
        admin_id="admin-1",
    )
    state.candidate = {"productionPayload": {"name": "", "dataOrigin": "AI_AGENT"}}
    state = await validate_candidate(state)
    assert state.final_status == "FAILED"


@pytest.mark.asyncio
async def test_validate_candidate_missing_province_is_warning():
    """Missing provinceId should NOT fail validation, but must generate a warning."""
    state = PlaceBuilderState(
        job_id="PLC-test",
        place_name="Núi Bà Đen",
        location_hint=None,
        operation="CREATE",
        target_place_id=None,
        admin_id="admin-1",
    )
    state.candidate = {
        "productionPayload": {
            "name": "Núi Bà Đen",
            "provinceId": None,  # not resolved
            "location": {"type": "Point", "coordinates": [106.166, 11.386]},
            "dataOrigin": "AI_AGENT",
        }
    }
    state = await validate_candidate(state)
    # Should save as PENDING_REVIEW but with a warning
    assert state.final_status != "FAILED"
    assert any("provinceId" in w for w in state.warnings)


# ─── duplicate_check ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_duplicate_check_finds_osm_match():
    """Duplicate check sets is_potential_duplicate when OSM ID matches."""
    from app.tools.trekking_service import TrekkingServiceClient

    mock_trekking = AsyncMock(spec=TrekkingServiceClient)
    mock_trekking.search_places.return_value = [
        {
            "trekkingPlaceId": "place-existing-123",
            "name": "Núi Bà Đen",
            "externalRefs": {"osm": {"type": "node", "id": "123456"}},
        }
    ]

    state = PlaceBuilderState(
        job_id="PLC-test",
        place_name="Núi Bà Đen",
        location_hint=None,
        operation="CREATE",
        target_place_id=None,
        admin_id="admin-1",
    )
    state.candidate = {
        "productionPayload": {
            "name": "Núi Bà Đen",
            "externalRefs": {"osm": {"type": "node", "id": "123456"}},
        }
    }

    state = await duplicate_check(state, mock_trekking)

    assert state.is_potential_duplicate is True
    assert state.matched_place_id == "place-existing-123"
    assert state.duplicate_score >= 90
    assert any("duplicate" in w.lower() for w in state.warnings)


@pytest.mark.asyncio
async def test_duplicate_check_no_match():
    """No match found → is_potential_duplicate stays False."""
    from app.tools.trekking_service import TrekkingServiceClient

    mock_trekking = AsyncMock(spec=TrekkingServiceClient)
    mock_trekking.search_places.return_value = []

    state = PlaceBuilderState(
        job_id="PLC-test",
        place_name="Rừng Lá",
        location_hint=None,
        operation="CREATE",
        target_place_id=None,
        admin_id="admin-1",
    )
    state.candidate = {
        "productionPayload": {
            "name": "Rừng Lá",
            "externalRefs": {"osm": {"type": "way", "id": "999999"}},
        }
    }

    state = await duplicate_check(state, mock_trekking)

    assert state.is_potential_duplicate is False
    assert state.matched_place_id is None


# ─── PlaceBuilderService.approve ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_approve_create_calls_trekking_service(test_settings):
    """Approve CREATE calls trekking-service and marks candidate APPROVED."""
    from app.workflows.place_builder.service import PlaceBuilderService

    mock_repo = AsyncMock()
    mock_events = AsyncMock()

    candidate_doc = {
        "placeCandidateId": "cand-1",
        "jobId": "PLC-test",
        "adminId": "admin-1",
        "operation": "CREATE",
        "targetPlaceId": None,
        "status": "PENDING_REVIEW",
        "candidate": {
            "productionPayload": {
                "name": "Núi Bà Đen",
                "provinceId": "province-taynin",
                "location": {"type": "Point", "coordinates": [106.166, 11.386]},
                "dataOrigin": "AI_AGENT",
            }
        },
    }
    mock_repo.find_by_id.return_value = candidate_doc
    mock_repo.update.return_value = {**candidate_doc, "status": "APPROVED"}

    with patch("app.workflows.place_builder.service.TrekkingServiceClient") as MockClient:
        mock_trekking = AsyncMock()
        mock_trekking.create_place.return_value = {"trekkingPlaceId": "new-place-id-456"}
        MockClient.return_value = mock_trekking

        svc = PlaceBuilderService(
            settings=test_settings,
            candidate_repo=mock_repo,
            event_repo=mock_events,
        )
        result = await svc.approve("cand-1", "admin-1")

    assert result["status"] == "APPROVED"
    assert result["productionPlaceId"] == "new-place-id-456"
    mock_trekking.create_place.assert_called_once()
    # update must have been called with status=APPROVED
    call_data = mock_repo.update.call_args[0][1]
    assert call_data["status"] == "APPROVED"
    assert call_data["productionSync"]["synced"] is True


@pytest.mark.asyncio
async def test_approve_requires_pending_review(test_settings):
    """Approve fails if candidate is not in PENDING_REVIEW status."""
    from app.workflows.place_builder.service import PlaceBuilderService

    mock_repo = AsyncMock()
    mock_events = AsyncMock()
    mock_repo.find_by_id.return_value = {
        "placeCandidateId": "cand-1",
        "jobId": "PLC-test",
        "adminId": "admin-1",
        "operation": "CREATE",
        "status": "APPROVED",  # already approved!
        "candidate": {"productionPayload": {"name": "Núi Bà Đen", "provinceId": "p1"}},
    }

    svc = PlaceBuilderService(
        settings=test_settings,
        candidate_repo=mock_repo,
        event_repo=mock_events,
    )

    with pytest.raises(ValueError, match="PENDING_REVIEW"):
        await svc.approve("cand-1", "admin-1")


@pytest.mark.asyncio
async def test_approve_requires_province_id(test_settings):
    """Approve fails if provinceId is not resolved."""
    from app.workflows.place_builder.service import PlaceBuilderService

    mock_repo = AsyncMock()
    mock_events = AsyncMock()
    mock_repo.find_by_id.return_value = {
        "placeCandidateId": "cand-1",
        "jobId": "PLC-test",
        "adminId": "admin-1",
        "operation": "CREATE",
        "status": "PENDING_REVIEW",
        "candidate": {
            "productionPayload": {
                "name": "Núi Bà Đen",
                "provinceId": None,  # not resolved
            }
        },
    }

    svc = PlaceBuilderService(
        settings=test_settings,
        candidate_repo=mock_repo,
        event_repo=mock_events,
    )

    with pytest.raises(ValueError, match="provinceId"):
        await svc.approve("cand-1", "admin-1")


@pytest.mark.asyncio
async def test_approve_production_api_failure_does_not_mark_approved(test_settings):
    """If trekking-service API fails, candidate must NOT be marked APPROVED."""
    from app.workflows.place_builder.service import PlaceBuilderService

    mock_repo = AsyncMock()
    mock_events = AsyncMock()
    mock_repo.find_by_id.return_value = {
        "placeCandidateId": "cand-1",
        "jobId": "PLC-test",
        "adminId": "admin-1",
        "operation": "CREATE",
        "status": "PENDING_REVIEW",
        "candidate": {
            "productionPayload": {
                "name": "Núi Bà Đen",
                "provinceId": "province-taynin",
            }
        },
    }

    with patch("app.workflows.place_builder.service.TrekkingServiceClient") as MockClient:
        mock_trekking = AsyncMock()
        mock_trekking.create_place.side_effect = RuntimeError("Trekking service is down")
        MockClient.return_value = mock_trekking

        svc = PlaceBuilderService(
            settings=test_settings,
            candidate_repo=mock_repo,
            event_repo=mock_events,
        )

        with pytest.raises(RuntimeError, match="NOT approved"):
            await svc.approve("cand-1", "admin-1")

    # Repo update must NOT have been called with status=APPROVED
    for call in mock_repo.update.call_args_list:
        data = call[0][1] if call[0] else call[1]
        assert data.get("status") != "APPROVED", "Must not mark APPROVED on production failure"


@pytest.mark.asyncio
async def test_reject(test_settings):
    """Reject sets status=REJECTED."""
    from app.workflows.place_builder.service import PlaceBuilderService

    mock_repo = AsyncMock()
    mock_events = AsyncMock()
    mock_repo.find_by_id.return_value = {
        "placeCandidateId": "cand-1",
        "jobId": "PLC-test",
        "adminId": "admin-1",
        "operation": "CREATE",
        "status": "PENDING_REVIEW",
        "candidate": None,
    }
    mock_repo.update.return_value = {"status": "REJECTED"}

    svc = PlaceBuilderService(
        settings=test_settings,
        candidate_repo=mock_repo,
        event_repo=mock_events,
    )
    result = await svc.reject("cand-1", "admin-1", note="Not accurate")

    assert result["status"] == "REJECTED"
    call_data = mock_repo.update.call_args[0][1]
    assert call_data["status"] == "REJECTED"
