"""Persistent observed history and append-only execution evidence."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import (
    JSON,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    event,
    select,
    update,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from counterspeech.schemas import ObservedTurn, RunRequest, RunResult, RunView


def utcnow():
    return datetime.now(UTC).isoformat()


class Base(DeclarativeBase):
    pass


class ConversationRow(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(150))
    created_at: Mapped[str] = mapped_column(String(40))
    active_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


class TurnRow(Base):
    __tablename__ = "turns"
    __table_args__ = (UniqueConstraint("conversation_id", "sequence"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    speaker: Mapped[str] = mapped_column(String(30))
    text: Mapped[str] = mapped_column(Text)
    provenance: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[str] = mapped_column(String(40))


class RunRow(Base):
    __tablename__ = "runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"), index=True)
    status: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[str] = mapped_column(String(40), index=True)
    updated_at: Mapped[str] = mapped_column(String(40))
    request_json: Mapped[dict] = mapped_column(JSON)
    result_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)


class EventRow(Base):
    __tablename__ = "trace_events"
    __table_args__ = (UniqueConstraint("run_id", "sequence"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    stage: Mapped[str] = mapped_column(String(60))
    payload_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(String(40))


class StoreError(Exception):
    pass


class NotFound(StoreError):
    pass


class ConversationBusy(StoreError):
    pass


class Store:
    def __init__(self, database_url: str):
        connect_args = (
            {"check_same_thread": False, "timeout": 10} if database_url.startswith("sqlite") else {}
        )
        self.engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
        if database_url.startswith("sqlite"):
            event.listen(self.engine, "connect", self._sqlite_foreign_keys)
        self.session = sessionmaker(self.engine, expire_on_commit=False)

    @staticmethod
    def _sqlite_foreign_keys(connection, _):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    def initialize(self):
        Base.metadata.create_all(self.engine)

    def close(self):
        self.engine.dispose()

    def create_conversation(self, title=""):
        row = ConversationRow(id=str(uuid4()), title=title, created_at=utcnow())
        with self.session.begin() as db:
            db.add(row)
        return {"conversation_id": row.id, "title": title, "created_at": row.created_at}

    def _claim(self, db, conversation_id, owner):
        changed = db.execute(
            update(ConversationRow)
            .where(ConversationRow.id == conversation_id, ConversationRow.active_run_id.is_(None))
            .values(active_run_id=owner)
        ).rowcount
        if not changed:
            if db.get(ConversationRow, conversation_id) is None:
                raise NotFound("conversation_not_found")
            raise ConversationBusy("conversation_busy")

    def _insert_turn(self, db, conversation_id, turn):
        last = (
            db.scalar(
                select(TurnRow.sequence)
                .where(TurnRow.conversation_id == conversation_id)
                .order_by(TurnRow.sequence.desc())
                .limit(1)
            )
            or 0
        )
        row = TurnRow(
            id=str(uuid4()),
            conversation_id=conversation_id,
            sequence=last + 1,
            **turn.model_dump(),
            created_at=utcnow(),
        )
        db.add(row)
        db.flush()
        return self._turn_dict(row)

    def append_observed(self, conversation_id: str, turn: ObservedTurn):
        with self.session.begin() as db:
            self._claim(db, conversation_id, "append")
            result = self._insert_turn(db, conversation_id, turn)
            db.execute(
                update(ConversationRow)
                .where(ConversationRow.id == conversation_id)
                .values(active_run_id=None)
            )
            return result

    def start_run(self, request: RunRequest):
        run_id = str(uuid4())
        conversation_id = str(request.conversation_id) if request.conversation_id else str(uuid4())
        now = utcnow()
        with self.session.begin() as db:
            if not request.conversation_id:
                db.add(ConversationRow(id=conversation_id, title="", created_at=now))
                db.flush()
            self._claim(db, conversation_id, run_id)
            for turn in request.initial_context:
                self._insert_turn(db, conversation_id, turn)
            self._insert_turn(
                db, conversation_id, ObservedTurn(speaker="original_speaker", text=request.text)
            )
            db.add(
                RunRow(
                    id=run_id,
                    conversation_id=conversation_id,
                    status="running",
                    created_at=now,
                    updated_at=now,
                    request_json=request.model_dump(mode="json"),
                )
            )
        return run_id, conversation_id

    def add_event(self, run_id: str, stage: str, payload: dict):
        with self.session.begin() as db:
            row = db.get(RunRow, run_id)
            if row is None:
                raise NotFound("run_not_found")
            # Row lock serializes event writers on PostgreSQL; SQLite serializes writes.
            db.execute(select(RunRow.id).where(RunRow.id == run_id).with_for_update())
            last = (
                db.scalar(
                    select(EventRow.sequence)
                    .where(EventRow.run_id == run_id)
                    .order_by(EventRow.sequence.desc())
                    .limit(1)
                )
                or 0
            )
            db.add(
                EventRow(
                    id=str(uuid4()),
                    run_id=run_id,
                    sequence=last + 1,
                    stage=stage,
                    payload_json=payload,
                    created_at=utcnow(),
                )
            )
            row.updated_at = utcnow()

    def finish(self, run_id: str, result: RunResult | None, error_code: str | None = None):
        with self.session.begin() as db:
            row = db.get(RunRow, run_id)
            if row is None:
                raise NotFound("run_not_found")
            row.status = "failed" if error_code else result.outcome
            row.result_json = result.model_dump(mode="json") if result else None
            row.error_code = error_code
            row.updated_at = utcnow()
            db.execute(
                update(ConversationRow)
                .where(
                    ConversationRow.id == row.conversation_id,
                    ConversationRow.active_run_id == run_id,
                )
                .values(active_run_id=None)
            )

    def get_run(self, run_id: str) -> RunView:
        with self.session() as db:
            row = db.get(RunRow, run_id)
            if row is None:
                raise NotFound("run_not_found")
            events = db.scalars(
                select(EventRow).where(EventRow.run_id == run_id).order_by(EventRow.sequence)
            ).all()
            return RunView.model_validate(
                {
                    "run_id": row.id,
                    "conversation_id": row.conversation_id,
                    "status": row.status,
                    "request": row.request_json,
                    "result": row.result_json,
                    "error_code": row.error_code,
                    "events": [
                        {
                            "sequence": e.sequence,
                            "stage": e.stage,
                            "payload": e.payload_json,
                            "created_at": e.created_at,
                        }
                        for e in events
                    ],
                    "created_at": row.created_at,
                    "updated_at": row.updated_at,
                }
            )

    def list_runs(self, limit=30):
        with self.session() as db:
            rows = db.scalars(select(RunRow).order_by(RunRow.created_at.desc()).limit(limit)).all()
            return [
                {
                    "run_id": r.id,
                    "conversation_id": r.conversation_id,
                    "status": r.status,
                    "mode": r.request_json["mode"],
                    "created_at": r.created_at,
                    "error_code": r.error_code,
                }
                for r in rows
            ]

    def get_conversation(self, conversation_id: str):
        with self.session() as db:
            row = db.get(ConversationRow, conversation_id)
            if row is None:
                raise NotFound("conversation_not_found")
            turns = db.scalars(
                select(TurnRow)
                .where(TurnRow.conversation_id == conversation_id)
                .order_by(TurnRow.sequence)
            ).all()
            runs = db.scalars(
                select(RunRow)
                .where(RunRow.conversation_id == conversation_id)
                .order_by(RunRow.created_at)
            ).all()
            trend = []
            for run in runs:
                if run.result_json and run.result_json.get("analysis"):
                    analysis = run.result_json["analysis"]
                    trend.append(
                        {
                            "run_id": run.id,
                            "hostility": analysis["hostility"],
                            "detected_language": analysis["detected_language"],
                            "provenance": "model_assessment_of_observed_input",
                        }
                    )
            return {
                "conversation_id": row.id,
                "title": row.title,
                "created_at": row.created_at,
                "active_run_id": row.active_run_id,
                "turns": [self._turn_dict(t) for t in turns],
                "runs": [{"run_id": r.id, "status": r.status} for r in runs],
                "hostility_trend": trend,
            }

    def model_memory(self, conversation_id: str, max_turns: int, max_chars: int):
        view = self.get_conversation(conversation_id)
        # Current input is supplied separately; never duplicate it in model history.
        earlier = view["turns"][:-1]
        selected = []
        used = 0
        for turn in reversed(earlier[-max_turns:]):
            if used + len(turn["text"]) > max_chars:
                break
            selected.append(turn)
            used += len(turn["text"])
        selected.reverse()
        return {
            "observed_history": selected,
            "history_total": len(earlier),
            "history_included": len(selected),
            "history_truncated": len(selected) < len(earlier),
            "hostility_trend": view["hostility_trend"][-max_turns:],
        }

    def recover_stale_runs(self, older_than_seconds: int = 1800):
        """Explicit operator recovery; never reclaim active jobs automatically on another worker."""
        cutoff = (datetime.now(UTC) - timedelta(seconds=older_than_seconds)).isoformat()
        with self.session() as db:
            ids = list(
                db.scalars(
                    select(RunRow.id).where(RunRow.status == "running", RunRow.updated_at < cutoff)
                )
            )
        for run_id in ids:
            self.add_event(run_id, "failed", {"code": "orphaned_run_recovered"})
            self.finish(run_id, None, "orphaned_run_recovered")
        return ids

    @staticmethod
    def _turn_dict(row):
        return {
            "turn_id": row.id,
            "sequence": row.sequence,
            "speaker": row.speaker,
            "text": row.text,
            "provenance": row.provenance,
            "created_at": row.created_at,
        }
