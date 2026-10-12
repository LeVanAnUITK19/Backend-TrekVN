"""Node: validate Place Builder input."""

from __future__ import annotations

from ..state import PlaceBuilderState


async def validate_input(state: PlaceBuilderState) -> PlaceBuilderState:
    errors = []

    place_name = (state.place_name or "").strip()
    if not place_name:
        errors.append("placeName is required")
    if len(place_name) > 200:
        errors.append("placeName exceeds maximum length")

    if state.operation not in ("CREATE", "UPDATE"):
        errors.append(f"Invalid operation: {state.operation}")

    if state.operation == "UPDATE" and not state.target_place_id:
        errors.append("targetPlaceId is required for UPDATE operation")

    if errors:
        state.errors.extend(errors)
        state.final_status = "FAILED"

    return state
