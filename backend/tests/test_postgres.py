"""Optional real PostgreSQL integration: isolated, disposable schema per test."""

import os
from uuid import uuid4

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from conftest import FixtureProvider
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from test_migrations import migration_config

from counterspeech.pipeline import Pipeline
from counterspeech.schemas import RunRequest
from counterspeech.store import Base, ConversationBusy, Store


@pytest.fixture
def postgres_store(monkeypatch):
    base_url = os.getenv("TEST_DATABASE_URL")
    if not base_url:
        pytest.skip("TEST_DATABASE_URL not supplied; PostgreSQL not claimed tested")
    schema = "test_" + uuid4().hex
    admin = create_engine(base_url)
    with admin.begin() as db:
        db.execute(text(f'CREATE SCHEMA "{schema}"'))
    url = make_url(base_url).update_query_dict({"options": f"-csearch_path={schema}"})
    rendered = url.render_as_string(hide_password=False)
    monkeypatch.setenv("DATABASE_URL", rendered)
    command.upgrade(migration_config(), "head")
    store = Store(rendered)
    try:
        yield store
    finally:
        store.close()
        with admin.begin() as db:
            db.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


async def test_real_postgres_migration_pipeline_persistence_and_claim(postgres_store, settings):
    store = postgres_store
    with store.engine.connect() as connection:
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
    request = RunRequest(text="I dislike everyone in that community.")
    rid, cid = store.start_run(request)
    other = Store(str(store.engine.url.render_as_string(hide_password=False)))
    try:
        with pytest.raises(ConversationBusy):
            other.start_run(RunRequest(text="concurrent input", conversation_id=cid))
        run = await Pipeline(store, FixtureProvider(adverse_rounds=1), settings).execute(
            rid, cid, request
        )
        assert run.status == "completed" and len(run.result.rounds) == 2
        assert other.get_run(rid).model_dump() == run.model_dump()
        assert other.get_conversation(cid)["active_run_id"] is None
    finally:
        other.close()
