import asyncio
from uuid import uuid4

import httpx
import pytest
from conftest import HEADERS, FixtureProvider
from fastapi.testclient import TestClient

from counterspeech.api import create_app


def test_auth_and_unconfigured_provider_never_fabricate_inference(settings):
    with TestClient(create_app(settings)) as client:
        assert client.get("/health").json()["inference_configured"] is False
        assert client.get("/v1/runs").status_code == 401
        assert client.get("/v1/runs", headers={"X-API-Key": "wrong"}).status_code == 401
        result = client.post("/v1/runs", headers=HEADERS, json={"text": "Hostile comment"})
        assert result.status_code == 503
        assert result.json()["detail"]["code"] == "inference_not_configured"
        assert client.get("/v1/runs", headers=HEADERS).json()["runs"] == []


def test_missing_access_configuration_is_closed(settings):
    settings = settings.model_copy(update={"research_api_key": None})
    with TestClient(create_app(settings)) as client:
        assert client.get("/v1/capabilities").status_code == 503


def test_run_retrieval_uses_exact_trace_and_observed_reply_api(client):
    response = client.post("/v1/runs", headers=HEADERS, json={"text": "I hate that whole group."})
    assert response.status_code == 201, response.text
    run = response.json()
    assert client.get(f"/v1/runs/{run['run_id']}", headers=HEADERS).json() == run
    assert client.get("/v1/runs", headers=HEADERS).json()["runs"][0]["run_id"] == run["run_id"]
    conversation = client.get(f"/v1/conversations/{run['conversation_id']}", headers=HEADERS).json()
    assert len(conversation["turns"]) == 1  # recommendation was never automatically posted
    posted = client.post(
        f"/v1/conversations/{run['conversation_id']}/turns",
        headers=HEADERS,
        json={"speaker": "human_reply", "text": "Actually posted edited response"},
    )
    assert posted.status_code == 201 and posted.json()["provenance"] == "user_provided_observation"
    capabilities = client.get("/v1/capabilities", headers=HEADERS).json()
    assert len(capabilities["languages"]) == 5 and capabilities["auto_posting"] is False


@pytest.mark.parametrize(
    "payload",
    [
        {"text": " "},
        {"text": "x" * 8001},
        {"text": "input", "max_refinements": 3},
        {"text": "input", "candidate_count": 1},
        {"text": "input", "output_language": "tamil"},
        {"text": "input", "provider_api_key": "must not be accepted"},
        {
            "text": "input",
            "conversation_id": str(uuid4()),
            "initial_context": [{"speaker": "human_reply", "text": "invalid combination"}],
        },
    ],
)
def test_invalid_inputs_rejected_before_inference(client, provider, payload):
    assert client.post("/v1/runs", headers=HEADERS, json=payload).status_code == 422
    assert provider.calls == []


def test_missing_resources_and_bad_ids(client):
    assert client.get(f"/v1/runs/{uuid4()}", headers=HEADERS).status_code == 404
    assert client.get("/v1/runs/not-a-uuid", headers=HEADERS).status_code == 422
    assert (
        client.post(
            "/v1/runs",
            headers=HEADERS,
            json={"text": "unknown conversation", "conversation_id": str(uuid4())},
        ).status_code
        == 404
    )


def test_failed_run_returns_sanitized_error_and_trace_id(settings):
    provider = FixtureProvider(fail_stage="generation")
    with TestClient(create_app(settings, provider)) as client:
        response = client.post("/v1/runs", headers=HEADERS, json={"text": "Hostile input"})
        assert response.status_code == 502
        run_id = response.json()["detail"]["run_id"]
        stored = client.get(f"/v1/runs/{run_id}", headers=HEADERS).json()
        assert stored["status"] == "failed" and stored["events"][-1]["stage"] == "failed"


def test_cors_only_allows_configured_origin(client):
    allowed = client.options(
        "/v1/runs",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-API-Key,Content-Type",
        },
    )
    assert allowed.status_code == 200
    blocked = client.options(
        "/v1/runs",
        headers={"Origin": "https://untrusted.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in blocked.headers


def test_oversized_body_is_rejected_before_model_work(client, provider):
    response = client.post("/v1/runs", headers=HEADERS, json={"text": "x" * 200000})
    assert response.status_code == 413
    assert provider.calls == []


@pytest.mark.parametrize("capacity,expected_status", [(1, 429), (2, 409)])
async def test_capacity_and_conversation_conflicts_do_not_write_extra_turns(
    settings, capacity, expected_status
):
    started, release = asyncio.Event(), asyncio.Event()

    class BlockingProvider(FixtureProvider):
        async def complete(self, stage, *args, **kwargs):
            if stage == "analysis":
                started.set()
                await release.wait()
            return await super().complete(stage, *args, **kwargs)

    settings = settings.model_copy(update={"max_concurrent_runs": capacity})
    app = create_app(settings, BlockingProvider())
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app), base_url="http://test"
        ) as client:
            created = await client.post(
                "/v1/conversations", headers=HEADERS, json={"title": "Concurrency test"}
            )
            cid = created.json()["conversation_id"]
            pending = asyncio.create_task(
                client.post(
                    "/v1/runs",
                    headers=HEADERS,
                    json={"text": "first observed input", "conversation_id": cid},
                )
            )
            try:
                await asyncio.wait_for(started.wait(), 2)
                second = await client.post(
                    "/v1/runs",
                    headers=HEADERS,
                    json={"text": "must not be inserted", "conversation_id": cid},
                )
                assert second.status_code == expected_status
                assert len(app.state.store.get_conversation(cid)["turns"]) == 1
                listed = await client.get("/v1/runs", headers=HEADERS)
                run_id = listed.json()["runs"][0]["run_id"]
                partial = await client.get(f"/v1/runs/{run_id}", headers=HEADERS)
                assert partial.json()["status"] == "running"
            finally:
                release.set()
                first = await pending
            assert first.status_code == 201
