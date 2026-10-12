"""
Shared pytest fixtures for all agent-service tests.

All external services (MongoDB, LLM, trekking-service, Overpass, R2)
are MOCKED — no real network calls in unit tests.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── Minimal settings fixture ──────────────────────────────────────────────────

@pytest.fixture
def test_settings():
    """Return a Settings-like object with safe test values."""
    from app.config import Settings

    return Settings(
        app_env="test",
        agent_mongodb_uri="mongodb://localhost:27017",
        agent_mongodb_db="trekviet_agent_test",
        trekking_service_url="http://fake-trekking:3003",
        trekviet_internal_token="test-internal-token",
        auth_service_url="http://fake-auth:3001",
        jwt_secret="test-jwt-secret-for-security-tests-at-least-32-bytes",
        llm_default_provider="auto",
        llm_provider_priority="groq",
        uit_llm_enabled=False,
        uit_llm_base_url="",
        uit_llm_api_key="",
        uit_llm_model="",
        groq_enabled=True,
        groq_api_key="test-groq-key",
        groq_model="llama3-8b-8192",
        openai_enabled=False,
        openai_api_key="",
        openai_model="",
        r2_account_id="test-account",
        r2_access_key_id="test-key",
        r2_secret_access_key="test-secret",
        r2_bucket="test-bucket",
        r2_public_base_url="https://pub-test.r2.dev",
        r2_endpoint_url="https://test-account.r2.cloudflarestorage.com",
        map_work_root="/tmp/trekviet-agent-test",
        map_tool_backend="native",
        map_osm_pbf_path="",
        map_artifact_ttl_hours=1,
        map_default_max_zoom=14,
        map_bbox_max_area_deg2=0.5,
        osm_overpass_url="http://fake-overpass/api/interpreter",
        request_timeout_seconds=5,
    )
