"""Prometheus exposition and ASGI instrumentation, including streamed responses."""

from __future__ import annotations

import hmac
import os
import time

from fastapi import FastAPI, Request
from fastapi.responses import Response
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    GCCollector,
    Gauge,
    Histogram,
    PlatformCollector,
    ProcessCollector,
    generate_latest,
)
from starlette.types import ASGIApp, Message, Receive, Scope, Send

SERVICE = "agent-service"
BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 180)


class PrometheusMiddleware:
    def __init__(self, app: ASGIApp, registry: CollectorRegistry) -> None:
        self.app = app
        labels = ("service", "method", "route", "status_code")
        self.total = Counter(
            "trekvn_http_requests_total", "Completed HTTP requests",
            labels, registry=registry,
        )
        self.duration = Histogram(
            "trekvn_http_request_duration_seconds", "HTTP response duration in seconds",
            labels, buckets=BUCKETS, registry=registry,
        )
        self.active = Gauge(
            "trekvn_http_requests_active", "In-flight HTTP requests",
            ("service",), registry=registry,
        ).labels(SERVICE)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"].rstrip("/") == "/metrics":
            await self.app(scope, receive, send)
            return
        started = time.perf_counter()
        status = 500
        self.active.inc()

        async def observed_send(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, observed_send)
        finally:
            # Routing has finished: path templates contain {id}, never real IDs.
            route = getattr(scope.get("route"), "path", "__unmatched__")
            method = scope["method"]
            if method not in {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}:
                method = "OTHER"
            self.total.labels(SERVICE, method, route, str(status)).inc()
            self.duration.labels(SERVICE, method, route, str(status)).observe(
                time.perf_counter() - started
            )
            self.active.dec()


def install_metrics(app: FastAPI, token: str = "") -> None:
    # One registry per application instance; safe for create_app() in tests.
    registry = CollectorRegistry()
    ProcessCollector(registry=registry)
    PlatformCollector(registry=registry)
    GCCollector(registry=registry)
    app.add_middleware(PrometheusMiddleware, registry=registry)

    @app.get("/metrics", include_in_schema=False)
    async def metrics(request: Request) -> Response:
        expected = os.environ.get("METRICS_TOKEN", token)
        if expected and not hmac.compare_digest(
            request.headers.get("authorization", "").encode(),
            ("Bearer " + expected).encode(),
        ):
            return Response(
                "Unauthorized", status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
        return Response(
            generate_latest(registry),
            headers={"Content-Type": CONTENT_TYPE_LATEST, "Cache-Control": "no-store"},
        )
