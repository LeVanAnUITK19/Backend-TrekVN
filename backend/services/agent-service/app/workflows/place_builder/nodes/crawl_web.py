"""Node: web crawl enrichment (optional/soft-fail)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.tools.web_crawler import WebCrawlerClient

from ..state import PlaceBuilderState

logger = logging.getLogger(__name__)


async def crawl_web(
    state: PlaceBuilderState,
    crawler: WebCrawlerClient,
) -> PlaceBuilderState:
    """
    Fetch web info (Wikipedia summary) for the place.
    Soft-fail: failure does not block pipeline.

    Raw HTML is NEVER stored. Only structured extracted content.
    """
    try:
        result = await crawler.extract_place_info(
            state.place_name,
            location_hint=state.location_hint,
        )
        state.web_info = result

        if result:
            logger.info(
                "WebCrawl: found '%s' via %s (%s)",
                result.get("title"),
                result.get("source"),
                result.get("language"),
            )
            state.sources.append({
                "provider": result.get("source", "web"),
                "sourceId": None,
                "url": result.get("sourceUrl"),
                "retrievedAt": datetime.now(tz=timezone.utc).isoformat(),
                "fields": ["description"],
            })
        else:
            state.failed_steps.append("crawl_web")

    except Exception as exc:
        logger.warning("Web crawl soft-fail: %s", exc)
        state.warnings.append(f"Web crawl unavailable: {exc}")
        state.failed_steps.append("crawl_web")

    return state
