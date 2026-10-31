import asyncio
import hmac
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from counterspeech import __version__
from counterspeech.config import Settings
from counterspeech.middleware import RequestSizeLimit
from counterspeech.pipeline import Pipeline
from counterspeech.providers.base import Provider
from counterspeech.providers.openai_compatible import OpenAICompatibleProvider
from counterspeech.schemas import (
    ConversationCreate,
    Language,
    Mode,
    ObservedTurn,
    RunRequest,
    RunView,
)
from counterspeech.store import ConversationBusy, NotFound, Store


def create_app(settings: Settings | None = None, provider: Provider | None = None):
    settings = settings or Settings.from_environment()
    store = Store(settings.database_url)
    live_provider = provider
    if live_provider is None and settings.provider_configured:
        live_provider = OpenAICompatibleProvider(settings)

    @asynccontextmanager
    async def lifespan(app):
        if settings.initialize_database:
            store.initialize()
        yield
        if live_provider:
            await live_provider.close()
        store.close()

    app = FastAPI(
        title="Adaptive Counterspeech Research API", version=__version__, lifespan=lifespan
    )
    app.state.store = store
    app.state.provider = live_provider
    app.add_middleware(RequestSizeLimit)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-API-Key"],
    )
    slots = asyncio.Semaphore(settings.max_concurrent_runs)

    async def authenticate(x_api_key: str | None = Header(default=None)):
        if settings.research_api_key is None:
            raise HTTPException(503, detail={"code": "research_access_not_configured"})
        expected = settings.research_api_key.get_secret_value()
        if x_api_key is None or not hmac.compare_digest(x_api_key.encode(), expected.encode()):
            raise HTTPException(401, detail={"code": "unauthorized"})

    @app.exception_handler(NotFound)
    async def missing_resource(request, exc):
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=404, content={"detail": {"code": str(exc)}})

    @app.exception_handler(ConversationBusy)
    async def busy_resource(request, exc):
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=409, content={"detail": {"code": "conversation_busy"}})

    @app.get("/health")
    async def health():
        return {
            "status": "ok",
            "version": __version__,
            "inference_configured": live_provider is not None,
        }

    auth = [Depends(authenticate)]

    @app.get("/v1/capabilities", dependencies=auth)
    async def capabilities():
        return {
            "languages": list(Language),
            "modes": list(Mode),
            "max_refinements": 2,
            "reaction_probability_kind": "uncalibrated_model_estimate",
            "inference_configured": live_provider is not None,
            "auto_posting": False,
        }

    @app.post("/v1/conversations", dependencies=auth, status_code=201)
    async def create_conversation(body: ConversationCreate):
        return store.create_conversation(body.title)

    @app.get("/v1/conversations/{conversation_id}", dependencies=auth)
    async def get_conversation(conversation_id: UUID):
        return store.get_conversation(str(conversation_id))

    @app.post("/v1/conversations/{conversation_id}/turns", dependencies=auth, status_code=201)
    async def append_turn(conversation_id: UUID, body: ObservedTurn):
        return store.append_observed(str(conversation_id), body)

    @app.get("/v1/runs", dependencies=auth)
    async def list_runs(limit: int = Query(default=30, ge=1, le=100)):
        return {"runs": store.list_runs(limit)}

    @app.get("/v1/runs/{run_id}", dependencies=auth, response_model=RunView)
    async def get_run(run_id: UUID):
        return store.get_run(str(run_id))

    @app.post("/v1/runs", dependencies=auth, response_model=RunView, status_code=201)
    async def create_run(body: RunRequest):
        if live_provider is None:
            raise HTTPException(503, detail={"code": "inference_not_configured"})
        # Reject excess work before writing a turn or creating an orphan run.
        if slots.locked():
            raise HTTPException(429, detail={"code": "run_capacity_exceeded"})
        async with slots:
            run_id, conversation_id = store.start_run(body)
            pipeline = Pipeline(store, live_provider, settings)
            result = await pipeline.execute(run_id, conversation_id, body)
            if result.status == "failed":
                raise HTTPException(
                    502,
                    detail={
                        "code": result.error_code,
                        "run_id": run_id,
                        "conversation_id": conversation_id,
                    },
                )
            return result

    return app


def app_factory():
    return create_app()
