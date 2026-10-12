"""
Application configuration — all values sourced from environment variables.
Never hard-code secrets, URLs, or API keys here.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── App ──────────────────────────────────────────────────────────────
    app_env: Literal["development", "production", "test"] = "development"
    port: int = 8000
    log_level: str = "INFO"
    # Comma-separated origins, e.g. "http://localhost:5173,http://localhost:3000"
    cors_allowed_origins: str = "http://localhost:5173,http://localhost:3000,http://localhost:8080"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]
    # ── Agent MongoDB ─────────────────────────────────────────────────────
    agent_mongodb_uri: str = Field(..., description="MongoDB URI for agent DB")
    agent_mongodb_db: str = "trekviet_agent"

    # ── Trekking Service ──────────────────────────────────────────────────
    trekking_service_url: str = Field(..., description="Base URL of trekking-service")
    trekviet_internal_token: str = Field(
        ..., description="Service-to-service token for internal calls"
    )

    # ── Checkin Service ───────────────────────────────────────────────────
    checkin_service_url: str = Field(
        default="http://localhost:3002", description="Base URL of checkin-service"
    )

    # ── Auth Service (used to verify Bearer tokens) ────────────────────────
    auth_service_url: str = Field(..., description="Base URL of auth-service")
    jwt_secret: str = Field(..., description="JWT secret shared with auth-service")

    # ── LLM Provider ─────────────────────────────────────────────────────
    llm_default_provider: str = "auto"
    llm_provider_priority: str = "uit,groq,openai"

    # UIT (OpenAI-compatible)
    uit_llm_enabled: bool = True
    uit_llm_base_url: str = ""
    uit_llm_api_key: str = ""
    uit_llm_model: str = ""

    # Groq
    groq_enabled: bool = True
    groq_api_key: str = ""
    groq_model: str = "llama3-8b-8192"

    # OpenAI (optional)
    openai_enabled: bool = False
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # ── Cloudflare R2 ─────────────────────────────────────────────────────
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = ""
    r2_public_base_url: str = ""
    r2_endpoint_url: str = ""  # e.g. https://<account>.r2.cloudflarestorage.com

    # ── Map Builder ───────────────────────────────────────────────────────
    map_work_root: str = "/tmp/trekviet-agent"
    map_artifact_ttl_hours: int = 72
    map_default_max_zoom: int = 14
    map_default_min_zoom: int = 10
    map_bbox_max_area_deg2: float = 0.5  # guard against giant bbox
    map_pipeline_mode: Literal["full", "mock"] = "full"  # mock skips osmium/tippecanoe/gdal
    map_tool_backend: Literal["auto", "native", "docker", "wsl-docker"] = "auto"
    map_tool_image: str = "trekvn-agent-map-tools:latest"
    map_wsl_distribution: str = "Ubuntu"
    map_tool_container_user: str = "1000:1000"
    map_source_package: str = ""  # optional existing MBTiles ZIP to clip (works without native tools)
    map_osm_pbf_path: str = ""  # prefer a regional OSM PBF; avoids Overpass entirely
    map_dem_path: str = ""  # optional local GeoTIFF/HGT; otherwise download Skadi DEM
    map_dem_url_template: str = "https://s3.amazonaws.com/elevation-tiles-prod/skadi/{lat}/{tile}.hgt.gz"
    map_contour_interval_m: int = Field(20, ge=1)
    map_native_max_zoom: int = Field(14, ge=0, le=14)
    map_hillshade_max_zoom: int = Field(12, ge=0, le=14)

    # ── OSM / External ────────────────────────────────────────────────────
    osm_overpass_url: str = "https://overpass-api.de/api/interpreter"
    request_timeout_seconds: int = 30

    # ── Assistant ─────────────────────────────────────────────────────────
    assistant_max_context_messages: int = 20
    assistant_max_output_tokens: int = 2048

    # ── Knowledge Base ────────────────────────────────────────────────────
    agent_knowledge_root: str = Field(
        default="/app/knowledge",
        description="Root directory for agent knowledge documents (read-only docs for Assistant)",
    )
    knowledge_max_chunk_chars: int = 1200   # max chars per knowledge chunk sent to LLM
    knowledge_search_top_k: int = 5          # default top-K results for search
    knowledge_max_file_bytes: int = 2_000_000  # 2 MB hard limit per knowledge file

    @field_validator("llm_provider_priority")
    @classmethod
    def parse_provider_priority(cls, v: str) -> str:
        # Just validate that it's a comma-separated list of known names
        valid = {"uit", "groq", "openai"}
        parts = [p.strip() for p in v.split(",") if p.strip()]
        for p in parts:
            if p not in valid:
                raise ValueError(f"Unknown LLM provider: {p}")
        return v

    @property
    def provider_priority_list(self) -> list[str]:
        return [p.strip() for p in self.llm_provider_priority.split(",") if p.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
