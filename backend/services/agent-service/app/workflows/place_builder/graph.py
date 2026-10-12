"""
Place Builder pipeline runner.

Executes nodes in sequence:
  validate_input → discover_osm → enrich_wikidata → crawl_web →
  normalize → duplicate_check → validate_candidate → save_candidate

Soft-fail nodes (wikidata, crawl_web) do not stop the pipeline.
Critical failure stops at validate_input or if name is absent after normalize.
"""

from __future__ import annotations

import logging

from app.config import Settings
from app.db.repositories.place_candidates import PlaceCandidateRepository
from app.db.repositories.workflow_events import WorkflowEventRepository
from app.tools.osm.overpass import OverpassClient
from app.tools.trekking_service import TrekkingServiceClient
from app.tools.web_crawler import WebCrawlerClient
from app.tools.wikidata import WikidataClient

from .nodes.crawl_web import crawl_web
from .nodes.discover_osm import discover_osm
from .nodes.duplicate_check import duplicate_check
from .nodes.normalize import normalize
from .nodes.save_candidate import save_candidate
from .nodes.validate_candidate import validate_candidate
from .nodes.validate_input import validate_input
from .state import PlaceBuilderState

logger = logging.getLogger(__name__)


async def run_place_builder_pipeline(
    state: PlaceBuilderState,
    settings: Settings,
    candidate_repo: PlaceCandidateRepository,
    event_repo: WorkflowEventRepository,
) -> PlaceBuilderState:
    """
    Execute the full Place Builder pipeline.
    Updates the candidate document in-place as steps complete.
    """

    async def log_event(event: str, level: str, message: str, metadata: dict | None = None):
        await event_repo.log(
            job_id=state.job_id,
            workflow_type="PLACE_BUILDER",
            event=event,
            level=level,
            message=message,
            metadata=metadata,
        )

    # Build clients — OverpassClient now uses Photon+OSM API internally
    overpass = OverpassClient(timeout=float(settings.request_timeout_seconds))
    wikidata = WikidataClient(timeout=float(settings.request_timeout_seconds))
    crawler = WebCrawlerClient(timeout=float(settings.request_timeout_seconds))
    trekking = TrekkingServiceClient(settings)

    await log_event("PIPELINE_START", "INFO", f"Place Builder started for '{state.place_name}'")

    # 1. Validate input
    await candidate_repo.update_by_job_id(state.job_id, {"status": "PROCESSING"})
    state = await validate_input(state)
    if state.final_status == "FAILED":
        await candidate_repo.update_by_job_id(
            state.job_id,
            {"status": "FAILED", "quality": {"warnings": state.warnings}},
        )
        await log_event("PIPELINE_FAILED", "ERROR", f"Input validation failed: {state.errors}")
        return state
    await log_event("VALIDATE_INPUT", "INFO", "Input valid")

    # 2. OSM discovery
    state = await discover_osm(state, overpass)
    await log_event(
        "DISCOVER_OSM",
        "WARN" if "discover_osm" in state.failed_steps else "INFO",
        "OSM discovery complete" if state.best_osm else "OSM: no match",
        {"osmId": state.best_osm.get("osmId") if state.best_osm else None},
    )

    # 3. Wikidata enrichment (soft-fail)
    state = await enrich_wikidata_safe(state, wikidata)
    await log_event(
        "ENRICH_WIKIDATA",
        "INFO" if state.wikidata else "WARN",
        "Wikidata enrichment done" if state.wikidata else "Wikidata: no result",
    )

    # 4. Web crawl (soft-fail)
    state = await crawl_web(state, crawler)
    await log_event(
        "CRAWL_WEB",
        "INFO" if state.web_info else "WARN",
        "Web crawl done" if state.web_info else "Web crawl: no result",
    )

    # 5. Normalize
    state = await normalize(state)
    await log_event("NORMALIZE", "INFO", "Normalization complete")

    # 6. Duplicate check
    state = await duplicate_check(state, trekking)
    await log_event(
        "DUPLICATE_CHECK",
        "WARN" if state.is_potential_duplicate else "INFO",
        f"Duplicate: {state.is_potential_duplicate} score={state.duplicate_score}",
    )

    # 7. Validate candidate
    state = await validate_candidate(state)
    await log_event(
        "VALIDATE_CANDIDATE",
        "WARN" if state.warnings else "INFO",
        f"Confidence: {state.confidence_score}/100 warnings={len(state.warnings)}",
    )

    if state.final_status == "FAILED":
        await candidate_repo.update_by_job_id(
            state.job_id,
            {
                "status": "FAILED",
                "quality": {
                    "confidenceScore": state.confidence_score,
                    "warnings": state.warnings,
                },
            },
        )
        await log_event("PIPELINE_FAILED", "ERROR", f"Candidate invalid: {state.errors}")
        return state

    # 8. Save candidate
    state = await save_candidate(state, candidate_repo)
    await log_event(
        "SAVE_CANDIDATE",
        "INFO",
        f"Candidate saved status={state.final_status}",
    )

    await log_event("PIPELINE_COMPLETE", "INFO", f"Pipeline done: {state.final_status}")
    return state


async def enrich_wikidata_safe(
    state: PlaceBuilderState,
    wikidata: WikidataClient,
) -> PlaceBuilderState:
    """Wrapper to import node function without circular import."""
    from .nodes.enrich_wikidata import enrich_wikidata
    return await enrich_wikidata(state, wikidata)
