"""
Web crawler adapter — lightweight, robots-respecting.

V1: Uses httpx + Wikipedia REST API.
Does NOT store raw HTML. Only extracts structured text snippets and licensed images.

Image policy:
- Only fetches Wikipedia thumbnail/originalimage — CC BY-SA licensed.
- Up to MAX_IMAGES images stored as {url, caption, source} objects.
- Raw HTML is never stored.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT = 20.0
_MAX_CONTENT_CHARS = 5000  # guard: never dump huge text into DB
_MAX_IMAGES = 3            # maximum images fetched per place
_USER_AGENT = "TrekVietBot/1.0 (trekking info aggregator; respects robots.txt)"

# Minimum image size to accept (avoid icons/logos)
_MIN_IMAGE_WIDTH = 300


class WebCrawlerClient:
    def __init__(self, timeout: float = _TIMEOUT):
        self._timeout = timeout

    async def extract_place_info(
        self, place_name: str, location_hint: Optional[str] = None
    ) -> Optional[dict[str, Any]]:
        """
        Search for a place via Wikipedia REST API and extract structured data.

        Returns dict with: source, language, title, extract, sourceUrl,
        coordinates, images (list of {url, caption, source}).
        Returns None on failure (soft-fail).
        """
        # Try Vietnamese Wikipedia first, fall back to English
        wiki_result = await self._fetch_wikipedia_summary(place_name, lang="vi")
        if not wiki_result:
            wiki_result = await self._fetch_wikipedia_summary(place_name, lang="en")

        if not wiki_result:
            logger.info("WebCrawler: no result for '%s'", place_name)
            return None

        return wiki_result

    async def _fetch_wikipedia_summary(
        self, place_name: str, lang: str = "vi"
    ) -> Optional[dict[str, Any]]:
        """
        Use Wikipedia REST API to get a summary with images.
        Content is CC BY-SA licensed — safe to store URLs.
        """
        encoded = place_name.replace(" ", "_")
        url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{encoded}"

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(
                    url,
                    headers={
                        "User-Agent": _USER_AGENT,
                        "Accept": "application/json",
                    },
                )
            if resp.status_code == 404:
                return None
            if not resp.is_success:
                return None

            data = resp.json()
            extract = data.get("extract", "")[:_MAX_CONTENT_CHARS]
            coordinates = data.get("coordinates")  # { lat, lon } if geo article

            # Collect images from Wikipedia response
            # Wikipedia REST summary returns `thumbnail` and `originalimage`
            images: list[dict[str, Any]] = []
            title = data.get("title", place_name)

            original = data.get("originalimage")
            if original and isinstance(original, dict):
                img_url = original.get("source")
                width = original.get("width", 0)
                if img_url and width >= _MIN_IMAGE_WIDTH:
                    images.append({
                        "url": img_url,
                        "caption": title,
                        "source": f"wikipedia:{lang}",
                        "width": width,
                        "height": original.get("height"),
                    })

            # Add thumbnail as fallback if original not available
            if not images:
                thumbnail = data.get("thumbnail")
                if thumbnail and isinstance(thumbnail, dict):
                    img_url = thumbnail.get("source")
                    width = thumbnail.get("width", 0)
                    if img_url and width >= _MIN_IMAGE_WIDTH:
                        images.append({
                            "url": img_url,
                            "caption": title,
                            "source": f"wikipedia:{lang}",
                            "width": width,
                            "height": thumbnail.get("height"),
                        })

            logger.info(
                "Wikipedia '%s' (%s): extract=%d chars images=%d",
                title, lang, len(extract), len(images)
            )

            return {
                "source": "wikipedia",
                "language": lang,
                "title": title,
                "extract": extract,
                "sourceUrl": data.get("content_urls", {}).get("desktop", {}).get("page"),
                "coordinates": coordinates,
                "images": images,
            }
        except Exception as exc:
            logger.warning("Wikipedia fetch soft-fail for '%s' (%s): %s", place_name, lang, exc)
            return None
