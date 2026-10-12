"""
Province ID resolver for Place Builder workflow.

Maps province display names (from Photon/OSM address) to internal provinceId.

TODO: Replace hard-coded mapping with dynamic lookup from checkin-service/auth-service
      GET /api/v1/provinces endpoint when available.
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Hard-coded mapping from Photon/OSM address.state to provinceId
# Based on checkin.provinces table (provinceId, code, name)
# Format: "Display Name" → "provinceId"
_PROVINCE_NAME_TO_ID = {
    # Miền Bắc
    "Hà Nội": "ha-noi",
    "Hải Phòng": "hai-phong",
    "Quảng Ninh": "quang-ninh",
    "Lạng Sơn": "lang-son",
    "Cao Bằng": "cao-bang",
    "Bắc Kạn": "bac-kan",
    "Thái Nguyên": "thai-nguyen",
    "Yên Bái": "yen-bai",
    "Lào Cai": "lao-cai",
    "Điện Biên": "dien-bien",
    "Lai Châu": "lai-chau",
    "Sơn La": "son-la",
    "Hòa Bình": "hoa-binh",
    "Hà Giang": "ha-giang",
    "Tuyên Quang": "tuyen-quang",
    "Phú Thọ": "phu-tho",
    "Bắc Giang": "bac-giang",
    "Bắc Ninh": "bac-ninh",
    "Vĩnh Phúc": "vinh-phuc",
    "Hải Dương": "hai-duong",
    "Hưng Yên": "hung-yen",
    "Thái Bình": "thai-binh",
    "Nam Định": "nam-dinh",
    "Ninh Bình": "ninh-binh",
    "Hà Nam": "ha-nam",
    
    # Miền Trung
    "Thanh Hóa": "thanh-hoa",
    "Nghệ An": "nghe-an",
    "Hà Tĩnh": "ha-tinh",
    "Quảng Bình": "quang-binh",
    "Quảng Trị": "quang-tri",
    "Thừa Thiên Huế": "thua-thien-hue",
    "Đà Nẵng": "da-nang",
    "Quảng Nam": "quang-nam",
    "Quảng Ngãi": "quang-ngai",
    "Bình Định": "binh-dinh",
    "Phú Yên": "phu-yen",
    "Khánh Hòa": "khanh-hoa",
    "Ninh Thuận": "ninh-thuan",
    "Bình Thuận": "binh-thuan",
    "Kon Tum": "kon-tum",
    "Gia Lai": "gia-lai",
    "Đắk Lắk": "dak-lak",
    "Đắk Nông": "dak-nong",
    "Lâm Đồng": "lam-dong",
    
    # Miền Nam
    "Bình Phước": "binh-phuoc",
    "Tây Ninh": "tay-ninh",
    "Bình Dương": "binh-duong",
    "Đồng Nai": "dong-nai",
    "Bà Rịa-Vũng Tàu": "ba-ria-vung-tau",
    "Thành phố Hồ Chí Minh": "ho-chi-minh",
    "Hồ Chí Minh": "ho-chi-minh",
    "Long An": "long-an",
    "Tiền Giang": "tien-giang",
    "Bến Tre": "ben-tre",
    "Trà Vinh": "tra-vinh",
    "Vĩnh Long": "vinh-long",
    "Đồng Tháp": "dong-thap",
    "An Giang": "an-giang",
    "Kiên Giang": "kien-giang",
    "Cần Thơ": "can-tho",
    "Hậu Giang": "hau-giang",
    "Sóc Trăng": "soc-trang",
    "Bạc Liêu": "bac-lieu",
    "Cà Mau": "ca-mau",
}


def resolve_province_id(province_name: Optional[str]) -> Optional[str]:
    """
    Resolve province display name to provinceId.
    
    Returns:
        provinceId string if found
        None if not found or province_name is None
    
    Example:
        >>> resolve_province_id("Tây Ninh")
        'tay-ninh'
        >>> resolve_province_id("Tỉnh Tây Ninh")
        'tay-ninh'
        >>> resolve_province_id("Unknown Province")
        None
    """
    if not province_name:
        return None
    
    # Normalize: strip whitespace and common prefixes
    name = province_name.strip()
    for prefix in ("Tỉnh ", "Thành phố ", "tỉnh ", "thành phố "):
        if name.startswith(prefix):
            name = name[len(prefix):]
            break
    
    # Direct lookup
    province_id = _PROVINCE_NAME_TO_ID.get(name)
    if province_id:
        logger.debug(f"Resolved province '{province_name}' → '{province_id}'")
        return province_id
    
    # Case-insensitive fallback
    name_lower = name.lower()
    for key, value in _PROVINCE_NAME_TO_ID.items():
        if key.lower() == name_lower:
            logger.debug(f"Resolved province '{province_name}' → '{value}' (case-insensitive)")
            return value
    
    logger.warning(f"Could not resolve province name '{province_name}' to provinceId")
    return None
