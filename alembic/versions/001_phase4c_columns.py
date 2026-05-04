"""Phase 4C: channel_type, channel.watt, module.is_vacant

Revision ID: 001_phase4c
Revises:
Create Date: 2026-05-04

Handles three scenarios:
  1. Fresh install (no tables) — creates everything via SQLModel.metadata.create_all
  2. Pre-4C install (tables exist, new columns missing) — ALTER TABLE
  3. Already migrated (columns present) — no-op
"""
import sqlalchemy as sa
from alembic import op

revision = "001_phase4c"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "property" not in tables:
        # Scenario 1: completely fresh install — no tables exist yet.
        # SQLModel.metadata.create_all creates all tables with the current
        # model definitions (which already include the 4C columns).
        from sqlmodel import SQLModel
        import models  # noqa: registers all table models with SQLModel.metadata
        SQLModel.metadata.create_all(bind=bind)
        return

    if "channel" not in tables:
        # Scenario 2a: pre-4B install — base tables exist but channel is missing.
        # Create the channel table from the current model (already includes 4C cols).
        from sqlmodel import SQLModel
        import models  # noqa
        SQLModel.metadata.tables["channel"].create(bind=bind)
        # Re-inspect so the column checks below reflect the new table.
        inspector = sa.inspect(bind)

    # Scenario 2b / 3: channel table exists — add any missing 4C columns.
    channel_cols = {c["name"] for c in inspector.get_columns("channel")}
    with op.batch_alter_table("channel") as batch_op:
        if "channel_type" not in channel_cols:
            batch_op.add_column(
                sa.Column("channel_type", sa.String(), nullable=False, server_default="relay")
            )
        if "watt" not in channel_cols:
            batch_op.add_column(
                sa.Column("watt", sa.Integer(), nullable=True)
            )

    module_cols = {c["name"] for c in inspector.get_columns("module")}
    with op.batch_alter_table("module") as batch_op:
        if "is_vacant" not in module_cols:
            batch_op.add_column(
                sa.Column("is_vacant", sa.Boolean(), nullable=False, server_default="0")
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "module" in tables:
        module_cols = {c["name"] for c in inspector.get_columns("module")}
        if "is_vacant" in module_cols:
            with op.batch_alter_table("module") as batch_op:
                batch_op.drop_column("is_vacant")

    if "channel" in tables:
        channel_cols = {c["name"] for c in inspector.get_columns("channel")}
        with op.batch_alter_table("channel") as batch_op:
            if "watt" in channel_cols:
                batch_op.drop_column("watt")
            if "channel_type" in channel_cols:
                batch_op.drop_column("channel_type")
