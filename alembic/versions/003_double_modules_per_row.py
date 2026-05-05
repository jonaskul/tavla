"""Convert panel dimensions from breaker-slot units to DIN-module units

Revision ID: 003_double_modules_per_row
Revises: 002_module_type_defs
Create Date: 2026-05-05

Background: modules_per_row (and module.width / module.position) were previously
stored in "breaker-slot" units, where 1 slot = 1 physical breaker position.
Norwegian DIN rails are measured in actual DIN module pitches (18 mm each).
A standard 1-phase circuit breaker (automatsikring) occupies 2 DIN modules, not 1.
Doubling all three columns makes stored values match the physical DIN module count:
  - A rail previously recorded as "12 slots" becomes 24 DIN modules — a standard
    24-module rail that fits 12 automatsikringer.
  - Existing modules shift position and width proportionally so their visual
    placement in the canvas is unchanged after the migration.
"""
import sqlalchemy as sa
from alembic import op

revision = "003_double_modules_per_row"
down_revision = "002_module_type_defs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Double panel capacity from breaker-slots to DIN modules
    op.execute("UPDATE panel SET modules_per_row = modules_per_row * 2")

    # Shift existing module positions and widths by the same factor so they
    # continue to occupy the same physical location on the rail
    op.execute("UPDATE module SET position = position * 2, width = width * 2")


def downgrade() -> None:
    op.execute("UPDATE panel SET modules_per_row = modules_per_row / 2")
    op.execute("UPDATE module SET position = position / 2, width = width / 2")
