"""Metrics tests run without MongoDB, LLM, or other backend services."""

import importlib
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient

from app.metrics import install_metrics


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("METRICS_TOKEN", "scrape-test-token")
    app = FastAPI()

    @app.get("/items/{item_id}")
    async def item(item_id: str):
        return {"id": item_id}

    @app.get("/stream")
    async def stream():
        async def chunks():
            yield b"first"
            yield b"second"
        return StreamingResponse(chunks())

    @app.get("/fail")
    async def fail():
        raise RuntimeError("test failure")

    install_metrics(app)
    return TestClient(app, raise_server_exceptions=False)


def scrape(client):
    return client.get("/metrics", headers={"Authorization": "Bearer scrape-test-token"})


def test_metrics_token_content_type_and_scrape_exclusion(client):
    assert client.get("/metrics").status_code == 401
    assert client.get("/metrics", headers={"Authorization": "Bearer user-jwt"}).status_code == 401
    client.get("/items/123?secret=abc")
    client.get("/items/456")
    for _ in range(3):
        response = scrape(client)
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/plain")
        assert 'route="/items/{item_id}"' in response.text
        assert 'route="/items/123"' not in response.text
        assert 'route="/metrics"' not in response.text
        assert "secret=abc" not in response.text
        assert 'trekvn_http_requests_active{service="agent-service"} 0.0' in response.text


def test_stream_and_unhandled_error_are_counted(client):
    assert client.get("/stream").text == "firstsecond"
    assert client.get("/fail").status_code == 500
    text = scrape(client).text
    assert 'route="/stream",service="agent-service",status_code="200"} 1.0' in text
    assert 'route="/fail",service="agent-service",status_code="500"} 1.0' in text
    assert 'trekvn_http_requests_active{service="agent-service"} 0.0' in text


def test_unknown_paths_share_one_label(client):
    client.get("/unknown-one")
    client.get("/unknown-two")
    text = scrape(client).text
    assert 'route="__unmatched__",service="agent-service",status_code="404"} 2.0' in text
    assert "unknown-one" not in text


def test_app_factory_installs_metrics(test_settings, monkeypatch):
    monkeypatch.setenv("METRICS_TOKEN", "scrape-test-token")
    with patch("app.config.get_settings", return_value=test_settings):
        main = importlib.import_module("app.main")
        with patch.object(main, "get_settings", return_value=test_settings):
            # Independent apps must not duplicate time series in one registry.
            for _ in range(2):
                app = main.create_app()
                response = scrape(TestClient(app))
                assert response.status_code == 200
                assert "trekvn_http_requests_total" in response.text


def test_empty_token_allows_local_development(monkeypatch):
    monkeypatch.delenv("METRICS_TOKEN", raising=False)
    app = FastAPI()
    install_metrics(app)
    assert TestClient(app).get("/metrics").status_code == 200
