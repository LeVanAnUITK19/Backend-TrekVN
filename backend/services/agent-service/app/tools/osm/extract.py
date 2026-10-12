"""Utilities for extracting and normalising OSM data into candidate fields."""

from __future__ import annotations

from typing import Any, Optional


def extract_coordinates(osm_element: dict[str, Any]) -> Optional[tuple[float, float]]:
    """Return (longitude, latitude) or None."""
    lat = osm_element.get("latitude")
    lon = osm_element.get("longitude")
    if lat is not None and lon is not None:
        try:
            return float(lon), float(lat)
        except (TypeError, ValueError):
            pass
    return None


def extract_elevation_meters(osm_element: dict[str, Any]) -> Optional[int]:
    """Parse OSM 'ele' tag (may be '986 m', '986', etc.) into integer metres."""
    raw = osm_element.get("elevation")
    if not raw:
        return None
    # Strip unit suffixes
    cleaned = str(raw).lower().replace("m", "").replace("ft", "").strip()
    try:
        val = float(cleaned)
        # If value looks like feet (> 5000 without unit context), keep as-is
        return int(round(val))
    except ValueError:
        return None


def best_osm_match(elements: list[dict[str, Any]], place_name: str) -> Optional[dict[str, Any]]:
    """
    Select the best matching OSM element by name similarity.
    Prefers exact match, then prefix match, then first result.
    """
    if not elements:
        return None

    name_lower = place_name.lower().strip()

    # Exact match
    for el in elements:
        if (el.get("name") or "").lower().strip() == name_lower:
            return el

    # Vietnamese name match
    for el in elements:
        if (el.get("nameVi") or "").lower().strip() == name_lower:
            return el

    # Partial match
    for el in elements:
        el_name = (el.get("name") or "").lower()
        if name_lower in el_name or el_name in name_lower:
            return el

    return elements[0]
