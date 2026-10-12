from datetime import datetime, timezone
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI

from app.api.tasks import router, _build_map_steps
from app.dependencies import get_agent_run_repo, get_current_admin, get_map_job_repo, get_place_candidate_repo, get_workflow_event_repo


@pytest.fixture
def history():
    app = FastAPI()
    app.include_router(router)
    places, maps, events = AsyncMock(), AsyncMock(), AsyncMock()
    places.find_by_id.return_value = places.find_by_job_id.return_value = None
    maps.find_by_id.return_value = maps.find_by_job_id.return_value = None
    events.find_by_job_id.return_value = []
    for repo, kind in [(places, "place"), (maps, "map")]:
        rows = [{f"{kind}CandidateId" if kind == "place" else "mapJobId": f"{kind}-{i}",
                 "jobId": f"{kind}-job-{i}", "placeName": f"Place {i}", "input": None,
                 "status": "PENDING_REVIEW", "createdAt": f"2026-10-{i + 1:02d}T00:00:00+00:00"}
                for i in range(25)]
        rows.reverse()
        repo.find_task_history.side_effect = lambda query, limit, rows=rows: rows[:limit]
        repo.count_task_history.return_value = len(rows)
    app.dependency_overrides[get_current_admin] = lambda: {"userId": "admin"}
    app.dependency_overrides[get_place_candidate_repo] = lambda: places
    app.dependency_overrides[get_map_job_repo] = lambda: maps
    app.dependency_overrides[get_workflow_event_repo] = lambda: events
    runs = AsyncMock()
    runs.find_task_history.return_value = []
    runs.count_task_history.return_value = 0
    runs.find_by_id.return_value = None
    app.dependency_overrides[get_agent_run_repo] = lambda: runs
    return app, places, maps, events, runs


async def request(history, url):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=history[0]), base_url="http://test") as client:
        return await client.get(url)


@pytest.mark.asyncio
@pytest.mark.parametrize("filters", ["", "?type=&status=&from=&to=&search="])
async def test_all_empty_filters_and_true_count(history, filters):
    response = await request(history, "/agent/tasks" + filters)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total"] == 50
    assert data["totalPages"] == 3
    assert len(data["data"]) == 20
    assert {task["type"] for task in data["data"]} == {"PLACE_BUILDER", "MAP_BUILDER"}


@pytest.mark.asyncio
async def test_merged_pages_no_duplicates_or_missing_rows(history):
    ids = []
    for page in range(1, 6):
        response = await request(history, f"/agent/tasks?page={page}&limit=10")
        data = response.json()["data"]
        assert data["total"] == 50
        assert len(data["data"]) == 10
        ids.extend(row["id"] for row in data["data"])
    assert len(set(ids)) == 50


@pytest.mark.asyncio
async def test_single_type_second_page_and_count_limit_one(history):
    data = (await request(history, "/agent/tasks?type=MAP_BUILDER&page=2&limit=10")).json()["data"]
    assert data["data"][0]["id"] == "map-14"
    assert data["total"] == 25
    assert not history[1].find_task_history.called
    assert (await request(history, "/agent/tasks?limit=1")).json()["data"]["total"] == 50


@pytest.mark.asyncio
async def test_filters_applied_in_database_before_pagination(history):
    await request(history, "/agent/tasks?status=PENDING_REVIEW&search=a.b&from=2026-10-11&to=2026-10-11")
    query = history[1].find_task_history.call_args.args[0]
    assert query["status"] == {"$in": ["PENDING_REVIEW", "NEEDS_FIX"]}
    assert query["$or"][0]["jobId"]["$regex"] == r"a\.b"
    bounds = query["$and"][0]["$or"][0]["createdAt"]
    assert bounds["$gte"] == datetime(2026, 10, 10, 17, tzinfo=timezone.utc)
    assert bounds["$lt"] == datetime(2026, 10, 11, 17, tzinfo=timezone.utc)
    assert history[1].count_task_history.call_args.args[0] == query


@pytest.mark.asyncio
@pytest.mark.parametrize("filters", ["from=bad", "from=2026-10-12&to=2026-10-11", "type=INVALID", "page=0", "limit=101"])
async def test_invalid_filters_return_422(history, filters):
    assert (await request(history, "/agent/tasks?" + filters)).status_code == 422


@pytest.mark.asyncio
async def test_detail_place_job_id_and_logs_with_null_level(history):
    history[1].find_by_job_id.return_value = {"placeCandidateId": "candidate-1", "jobId": "PL-1", "input": None, "candidate": {"name": "Mountain"}}
    history[3].find_by_job_id.return_value = [{"level": None, "message": "start"}, {"level": "WARNING", "message": "warning"}]
    response = await request(history, "/agent/tasks/PL-1")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["id"] == "candidate-1"
    assert data["result"]["name"] == "Mountain"
    assert [log["level"] for log in data["logs"]] == ["info", "warn"]
    history[3].find_by_job_id.assert_awaited_with("PL-1")


@pytest.mark.asyncio
async def test_map_detail_mixed_dates_error_and_missing_task(history):
    history[2].find_by_id.return_value = {"mapJobId": "map-id", "jobId": "MAP-1", "status": "FAILED", "error": {"message": "failed"}, "createdAt": datetime.now(timezone.utc)}
    response = await request(history, "/agent/tasks/map-id")
    assert response.status_code == 200
    assert response.json()["data"]["errorMessage"] == "failed"
    history[2].find_by_id.return_value = None
    assert (await request(history, "/agent/tasks/missing")).status_code == 404


def test_real_progress_statuses_and_completed_fallback():
    steps = _build_map_steps({"status": "PROCESSING", "progress": {"steps": [
        {"name": "VALIDATE_INPUT", "status": "DONE"}, {"name": "BUILD", "status": "RUNNING"},
        {"name": "UPLOAD", "status": "FAILED", "error": "upload failed"}]}})
    assert [step["status"] for step in steps] == ["done", "active", "error"]
    assert steps[0]["label"] == "VALIDATE_INPUT"
    assert all(step["status"] == "done" for step in _build_map_steps({"status": "PUBLISHED"}))


@pytest.mark.asyncio
async def test_assistant_history_and_detail(history):
    run = {"agentRunId": "run-1", "runType": "ASSISTANT_CHAT", "status": "RUNNING",
           "conversationId": "conv-1", "createdAt": "2026-10-26T00:00:00Z"}
    history[4].find_task_history.return_value = [run]
    history[4].count_task_history.return_value = 1
    response = await request(history, "/agent/tasks?type=ASSISTANT&status=PROCESSING")
    data = response.json()["data"]
    assert data["total"] == 1
    assert data["data"][0]["status"] == "PROCESSING"
    assert history[4].find_task_history.call_args.args[0] == {"runType": "ASSISTANT_CHAT", "status": "RUNNING"}
    assert (await request(history, "/agent/tasks")).json()["data"]["total"] == 51
    history[4].find_by_id.return_value = run
    detail = (await request(history, "/agent/tasks/run-1")).json()["data"]
    assert detail["type"] == "ASSISTANT"
    assert detail["id"] == "run-1"
