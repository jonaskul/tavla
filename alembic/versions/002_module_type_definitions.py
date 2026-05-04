"""Add ModuleTypeDefinition table and seed built-in types

Revision ID: 002_module_type_defs
Revises: 001_phase4c
Create Date: 2026-05-04

Handles:
  1. Fresh install (tables already created by 001 via create_all) — skip table creation, seed only
  2. Existing install (tables present, moduletypedefinition missing) — create table then seed
  3. Already migrated — no-op
"""
import sqlalchemy as sa
from alembic import op
from datetime import datetime

revision = "002_module_type_defs"
down_revision = "001_phase4c"
branch_labels = None
depends_on = None

BUILTIN_TYPES = [
    {"key": "breaker",          "name_no": "Automatsikring",     "color": "#2563eb", "abbreviation": "LS", "can_have_circuit": True,  "can_have_ampere": True},
    {"key": "rcd",              "name_no": "Jordfeilbryter",     "color": "#ca8a04", "abbreviation": "JF", "can_have_circuit": False, "can_have_ampere": True},
    {"key": "rcd_breaker",      "name_no": "Kombibryter",        "color": "#16a34a", "abbreviation": "KO", "can_have_circuit": True,  "can_have_ampere": True},
    {"key": "shelly",           "name_no": "Shelly",             "color": "#ea580c", "abbreviation": "SH", "can_have_circuit": False, "can_have_ampere": False},
    {"key": "dynalite",         "name_no": "Dynalite",           "color": "#9333ea", "abbreviation": "DY", "can_have_circuit": False, "can_have_ampere": False},
    {"key": "surge_protection", "name_no": "Overspenningsvern",  "color": "#dc2626", "abbreviation": "OV", "can_have_circuit": False, "can_have_ampere": False},
    {"key": "main_switch",      "name_no": "Hovedbryter (OV50)", "color": "#374151", "abbreviation": "OV", "can_have_circuit": False, "can_have_ampere": True},
    {"key": "other",            "name_no": "Annet",              "color": "#6b7280", "abbreviation": "—",  "can_have_circuit": False, "can_have_ampere": False},
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "moduletypedefinition" not in tables:
        op.create_table(
            "moduletypedefinition",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("key", sa.String(), nullable=False, unique=True),
            sa.Column("name_no", sa.String(), nullable=False),
            sa.Column("color", sa.String(), nullable=False),
            sa.Column("abbreviation", sa.String(), nullable=False),
            sa.Column("can_have_circuit", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("can_have_ampere", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    existing_count = bind.execute(sa.text("SELECT COUNT(*) FROM moduletypedefinition")).scalar()
    if existing_count == 0:
        now = datetime.utcnow().isoformat()
        for row in BUILTIN_TYPES:
            bind.execute(
                sa.text(
                    "INSERT INTO moduletypedefinition "
                    "(key, name_no, color, abbreviation, can_have_circuit, can_have_ampere, is_builtin, created_at) "
                    "VALUES (:key, :name_no, :color, :abbreviation, :can_have_circuit, :can_have_ampere, 1, :created_at)"
                ),
                {**row, "created_at": now},
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "moduletypedefinition" in set(inspector.get_table_names()):
        op.drop_table("moduletypedefinition")
