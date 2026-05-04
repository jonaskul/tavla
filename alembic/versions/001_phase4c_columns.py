"""Phase 4C: channel_type, channel.watt, module.is_vacant

Revision ID: 001_phase4c
Revises:
Create Date: 2026-05-04
"""
from alembic import op
import sqlalchemy as sa

revision = "001_phase4c"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("channel") as batch_op:
        batch_op.add_column(
            sa.Column("channel_type", sa.String(), nullable=False, server_default="relay")
        )
        batch_op.add_column(
            sa.Column("watt", sa.Integer(), nullable=True)
        )

    with op.batch_alter_table("module") as batch_op:
        batch_op.add_column(
            sa.Column("is_vacant", sa.Boolean(), nullable=False, server_default="0")
        )


def downgrade() -> None:
    with op.batch_alter_table("module") as batch_op:
        batch_op.drop_column("is_vacant")

    with op.batch_alter_table("channel") as batch_op:
        batch_op.drop_column("watt")
        batch_op.drop_column("channel_type")
