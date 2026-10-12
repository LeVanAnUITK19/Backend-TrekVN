"""
Health endpoints.

GET /health        — process alive (liveness)
GET /health/ready  — MongoDB reachable + config valid (readiness)

Provider availability does NOT make the service unready.
UIT may be offline outside the university network — Groq/OpenAI still work.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings
from app.db.mongo import get_db

router = APIRouter(tags=["Health"])


@router.get("/health")
async def liveness() -> dict:
    """Liveness probe — returns 200 if the process is alive."""
    return {"status": "ok"}


@router.get("/health/ready")
async def readiness() -> dict:
    """
    Readiness probe.
    Checks:
      - MongoDB Agent DB reachable (ping)
      - Knowledge service initialized
      - Critical config values present
    Returns 200 if ready, 503 if not.
    """
    from fastapi import HTTPException, status
    from app.knowledge import get_knowledge_service

    checks: dict[str, bool] = {}
    errors: list[str] = []

    # ── MongoDB ───────────────────────────────────────────────────────────
    try:
        db = get_db()
        await db.client.admin.command("ping")
        checks["mongodb"] = True
    except Exception as exc:
        checks["mongodb"] = False
        errors.append(f"MongoDB unreachable: {exc}")

    # ── Knowledge service ─────────────────────────────────────────────────
    try:
        ks = get_knowledge_service()
        ks_health = ks.health()
        checks["knowledge"] = ks_health["catalog_built"]
        if not ks_health["catalog_built"]:
            errors.append(f"Knowledge catalog not built: {ks_health.get('error', 'unknown')}")
    except Exception as exc:
        checks["knowledge"] = False
        errors.append(f"Knowledge service unavailable: {exc}")

    # ── Critical config ───────────────────────────────────────────────────
    s = get_settings()
    if not s.agent_mongodb_uri:
        checks["config_mongodb_uri"] = False
        errors.append("AGENT_MONGODB_URI not set")
    else:
        checks["config_mongodb_uri"] = True

    if not s.trekking_service_url:
        checks["config_trekking_url"] = False
        errors.append("TREKKING_SERVICE_URL not set")
    else:
        checks["config_trekking_url"] = True

    if not s.jwt_secret:
        checks["config_jwt_secret"] = False
        errors.append("JWT_SECRET not set")
    else:
        checks["config_jwt_secret"] = True

    all_ready = all(checks.values())

    if not all_ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "not_ready",
                "checks": checks,
                "errors": errors,
            },
        )

    return {
        "status": "ready",
        "checks": checks,
    }
