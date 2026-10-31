"""Initial greenfield schema; no research data prepopulated."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "conversations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(150), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("active_run_id", sa.String(36), nullable=True),
    )
    op.create_table(
        "turns",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "conversation_id", sa.String(36), sa.ForeignKey("conversations.id"), nullable=False
        ),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("speaker", sa.String(30), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("provenance", sa.String(40), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.UniqueConstraint("conversation_id", "sequence"),
    )
    op.create_index("ix_turns_conversation_id", "turns", ["conversation_id"])
    op.create_table(
        "runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "conversation_id", sa.String(36), sa.ForeignKey("conversations.id"), nullable=False
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.Column("request_json", sa.JSON(), nullable=False),
        sa.Column("result_json", sa.JSON(), nullable=True),
        sa.Column("error_code", sa.String(80), nullable=True),
    )
    op.create_index("ix_runs_conversation_id", "runs", ["conversation_id"])
    op.create_index("ix_runs_created_at", "runs", ["created_at"])
    op.create_table(
        "trace_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(60), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.UniqueConstraint("run_id", "sequence"),
    )
    op.create_index("ix_trace_events_run_id", "trace_events", ["run_id"])


def downgrade():
    op.drop_table("trace_events")
    op.drop_table("runs")
    op.drop_table("turns")
    op.drop_table("conversations")
