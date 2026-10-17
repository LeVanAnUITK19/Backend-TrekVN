"""Unit tests for utility helpers."""

from __future__ import annotations

import pytest

from app.utils.ids import slugify, new_place_job_id, new_map_job_id
from app.workflows.map_builder.steps.validate_input import validate_input
from app.workflows.place_builder.nodes.validate_input import validate_input as place_validate


# ─── slugify ─────────────────────────────────────────────────────────────────

def test_slugify_vietnamese():
    assert slugify("Núi Bà Đen") == "nui-ba-den"


def test_slugify_special_chars():
    assert slugify("Đà Lạt (Lâm Đồng)") == "da-lat-lam-dong"


def test_slugify_already_ascii():
    assert slugify("ba-den") == "ba-den"


def test_slugify_numbers():
    assert slugify("Khu A 123") == "khu-a-123"


# ─── job ID format ────────────────────────────────────────────────────────────

def test_place_job_id_format():
    jid = new_place_job_id()
    assert jid.startswith("PLC-")
    parts = jid.split("-")
    assert len(parts) == 3
    assert len(parts[1]) == 8   # YYYYMMDD


def test_map_job_id_format():
    jid = new_map_job_id()
    assert jid.startswith("MAP-")


# ─── bbox validation ─────────────────────────────────────────────────────────

def test_validate_bbox_valid():
    from app.harness.validation import validate_bbox
    # Should not raise
    validate_bbox(106.0, 11.0, 107.0, 12.0)


def test_validate_bbox_min_gt_max():
    from app.harness.validation import validate_bbox
    with pytest.raises(ValueError, match="minLon"):
        validate_bbox(107.0, 11.0, 106.0, 12.0)


def test_validate_bbox_lat_out_of_range():
    from app.harness.validation import validate_bbox
    with pytest.raises(ValueError):
        validate_bbox(106.0, -95.0, 107.0, 12.0)


# ─── sanitize_place_name ──────────────────────────────────────────────────────

def test_sanitize_place_name_strips_dangerous():
    from app.harness.validation import sanitize_place_name
    assert sanitize_place_name("Núi Bà Đen") == "Núi Bà Đen"


def test_sanitize_place_name_removes_semicolon():
    from app.harness.validation import sanitize_place_name
    result = sanitize_place_name("Núi; rm -rf /")
    assert ";" not in result


def test_sanitize_place_name_empty_raises():
    from app.harness.validation import sanitize_place_name
    with pytest.raises(ValueError, match="empty"):
        sanitize_place_name(";|&")
