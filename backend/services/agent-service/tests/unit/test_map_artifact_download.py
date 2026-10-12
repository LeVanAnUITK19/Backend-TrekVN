from unittest.mock import AsyncMock
import zipfile

import httpx
import pytest
from fastapi import FastAPI

from app.api.map_builder import router, legacy_router, _get_service
from app.dependencies import get_current_admin
from app.workflows.map_builder.service import MapBuilderService


@pytest.mark.asyncio
async def test_preview_and_download_stream_same_zip_with_owner_guard(test_settings, tmp_path):
    path = tmp_path / "map.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("manifest.json", '{"packageId":"test"}')
    test_settings.map_work_root = str(tmp_path)
    jobs = AsyncMock()
    jobs.find_by_job_id.return_value = {
        "jobId": "MAP-test", "adminId": "owner", "status": "PENDING_REVIEW",
        "output": {"tempPath": str(path)},
    }
    service = MapBuilderService(test_settings, jobs, AsyncMock())
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.include_router(legacy_router, prefix="/api/v1")
    app.dependency_overrides[_get_service] = lambda: service
    app.dependency_overrides[get_current_admin] = lambda: {"userId": "owner"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        url = "/api/v1/agent/map-artifacts/MAP-test/file"
        response = await client.get(url)
        assert response.status_code == 200
        assert response.content == path.read_bytes()
        assert response.headers["content-type"] == "application/zip"
        legacy = await client.get("/api/v1/map-builder/jobs/MAP-test/artifact")
        assert legacy.content == response.content
        link = await client.get("/api/v1/agent/map-artifacts/MAP-test/download")
        assert link.json()["data"]["url"] == url
        jobs.find_by_job_id.return_value["status"] = "PUBLISHED"
        assert (await client.get(url)).content == response.content
        jobs.find_by_job_id.return_value["status"] = "PENDING_REVIEW"
        app.dependency_overrides[get_current_admin] = lambda: {"userId": "other"}
        assert (await client.get(url)).status_code == 404
        app.dependency_overrides[get_current_admin] = lambda: {"userId": "owner"}
        jobs.find_by_job_id.return_value["status"] = "PROCESSING"
        assert (await client.get(url)).status_code == 404
        jobs.find_by_job_id.return_value["status"] = "PENDING_REVIEW"
        jobs.find_by_job_id.return_value["output"]["tempPath"] = str(tmp_path.parent / "not-allowed.zip")
        assert (await client.get(url)).status_code == 404


@pytest.mark.asyncio
async def test_artifact_file_requires_authentication():
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[_get_service] = lambda: AsyncMock()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/agent/map-artifacts/MAP-test/file")
    assert response.status_code in (401, 403)
