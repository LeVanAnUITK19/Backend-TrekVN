"""Utilities for generating typed IDs and slugs."""

from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import datetime, timezone


def new_uuid() -> str:
    """Generate a new UUID4 string."""
    return str(uuid.uuid4())


def _fmt_date() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y%m%d")


def new_place_job_id() -> str:
    """E.g. PLC-20261003-<8hex>"""
    return f"PLC-{_fmt_date()}-{uuid.uuid4().hex[:8].upper()}"


def new_map_job_id() -> str:
    """E.g. MAP-20261003-<8hex>"""
    return f"MAP-{_fmt_date()}-{uuid.uuid4().hex[:8].upper()}"


def slugify(text: str) -> str:
    """
    Convert Vietnamese text to a URL-safe ASCII slug.
    'Núi Bà Đen' → 'nui-ba-den'
    'Đà Lạt'     → 'da-lat'
    """
    # Dùng unidecode nếu có (xử lý ký tự đặc biệt như Đ → D)
    try:
        from unidecode import unidecode
        text = unidecode(text)
    except ImportError:
        # Fallback: NFD decompose + strip combining marks
        # Xử lý thủ công các ký tự không decompose được qua NFD
        _manual = {
            'đ': 'd', 'Đ': 'd',
            'ă': 'a', 'Ă': 'a',
            'ơ': 'o', 'Ơ': 'o',
            'ư': 'u', 'Ư': 'u',
        }
        for src, dst in _manual.items():
            text = text.replace(src, dst)
        text = unicodedata.normalize("NFD", text)
        text = "".join(c for c in text if unicodedata.category(c) != "Mn")

    # Lowercase và thay ký tự không phải a-z0-9 bằng dấu gạch
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    return text
