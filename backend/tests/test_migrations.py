from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import inspect

from counterspeech.store import Base, Store


def migration_config():
    return Config(str(Path(__file__).parents[1] / "alembic.ini"))


def test_initial_migration_matches_models_and_downgrades(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/migrations.db"
    monkeypatch.setenv("DATABASE_URL", url)
    config = migration_config()
    command.upgrade(config, "head")
    store = Store(url)
    try:
        with store.engine.connect() as connection:
            assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
        store.create_conversation("Migration persistence test")
        command.downgrade(config, "base")
        assert set(inspect(store.engine).get_table_names()) == {"alembic_version"}
        command.upgrade(config, "head")
        assert "trace_events" in inspect(store.engine).get_table_names()
    finally:
        store.close()
