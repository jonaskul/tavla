"""row level security for tenant tables

Isolation enforced by the database rather than by remembering a WHERE
clause in every query. This is the layer that cannot be bypassed by a
missed filter — the failure mode this codebase has already demonstrated,
where a hand-written guard was correct in three places and forgotten in
two.

PostgreSQL only. SQLite has no row-level security, so on SQLite this is a
no-op and isolation rests on the application-level scoping in tenancy.py.
That is the reason production runs PostgreSQL.

Notes on the policy:

- FORCE ROW LEVEL SECURITY matters. A plain ENABLE leaves the table owner
  exempt, and the application usually owns its own tables, so without FORCE
  the policies would appear to do nothing.
- current_setting(..., true) returns NULL when unset, and comparing to NULL
  yields no rows. Unset therefore means "see nothing", not "see everything".
- moduletypedefinition also admits rows with organization_id IS NULL: those
  are the shared built-in types, readable by every tenant and written only
  by the seeding code at startup.

Revision ID: b1c2d3e4f5a6
Revises: 8a48771f9a27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "8a48771f9a27"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SETTING = "app.organization_id"

# Tables whose every row belongs to exactly one tenant.
TENANT_TABLES = (
    "property",
    "panel",
    "module",
    "circuit",
    "connectionpoint",
    "equipment",
    "file",
    "changelog",
    "channel",
)

# Shared built-ins live here with organization_id IS NULL.
SHARED_NULL_TABLES = ("moduletypedefinition",)

POLICY = "tenant_isolation"


def _match(table: str, allow_null: bool) -> str:
    own = f"{table}.organization_id = NULLIF(current_setting('{SETTING}', true), '')::int"
    return f"({own} OR {table}.organization_id IS NULL)" if allow_null else own


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return

    for table in TENANT_TABLES + SHARED_NULL_TABLES:
        allow_null = table in SHARED_NULL_TABLES
        predicate = _match(table, allow_null)
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {POLICY} ON {table} "
            f"USING ({predicate}) WITH CHECK ({predicate})"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return

    for table in TENANT_TABLES + SHARED_NULL_TABLES:
        op.execute(f"DROP POLICY IF EXISTS {POLICY} ON {table}")
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
