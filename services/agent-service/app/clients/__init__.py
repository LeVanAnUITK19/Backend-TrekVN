"""
Reusable HTTP clients for internal service-to-service calls.

All clients:
- Use service-to-service token (NOT admin user token)
- Support timeout, retry, and error normalisation
- Log correlationId for observability
- Return None / empty list on 404 (never raise on expected absence)
- Raise RuntimeError on unexpected HTTP errors

SECURITY:
- Base URLs come from Settings (server-side config) — never from LLM/user input
- SSRF protection: LLM cannot influence the hostname
"""
from .auth_client import AuthServiceClient
from .checkin_client import CheckinServiceClient
from .trekking_client import TrekkingReadClient

__all__ = ["TrekkingReadClient", "CheckinServiceClient", "AuthServiceClient"]
