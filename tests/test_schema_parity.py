"""The two schemas must stay the same shape while both exist.

The rewrite runs over several sessions, with the Python implementation live
and the Workers one being built beside it. A column added to one and
forgotten in the other is the easiest possible way for them to drift, and
it would surface much later as a puzzling contract failure rather than as
the schema mistake it is.

This reads the Drizzle migration rather than the TypeScript, because the
migration is what D1 actually gets.

Skipped when the Workers project is absent, so a checkout without it still
runs green.
"""

import glob
import pathlib
import sqlite3

import pytest
from sqlmodel import SQLModel

import models  # noqa: F401  — registers the tables

WORKERS_MIGRATIONS = (
    pathlib.Path(__file__).resolve().parent.parent / "workers" / "migrations"
)


def workers_schema() -> dict:
    files = sorted(glob.glob(str(WORKERS_MIGRATIONS / "*.sql")))
    if not files:
        pytest.skip("workers/migrations finnes ikke")

    con = sqlite3.connect(":memory:")
    for path in files:
        # drizzle-kit separates statements with a marker comment.
        con.executescript(
            pathlib.Path(path).read_text().replace("--> statement-breakpoint", ";")
        )

    return {
        name: {row[1] for row in con.execute(f"pragma table_info({name})")}
        for (name,) in con.execute(
            "select name from sqlite_master "
            "where type='table' and name not like 'sqlite_%' "
            "and name != 'd1_migrations'"
        )
    }


def python_schema() -> dict:
    return {
        name: {c.name for c in table.columns}
        for name, table in SQLModel.metadata.tables.items()
    }


def test_the_same_tables_exist_on_both_sides():
    py, ts = python_schema(), workers_schema()
    assert set(py) == set(ts), (
        f"bare i Python: {sorted(set(py) - set(ts))}, "
        f"bare i Workers: {sorted(set(ts) - set(py))}"
    )


def test_every_table_has_the_same_columns():
    py, ts = python_schema(), workers_schema()

    differences = {}
    for table in sorted(set(py) & set(ts)):
        missing = py[table] - ts[table]
        extra = ts[table] - py[table]
        if missing or extra:
            differences[table] = {
                "mangler i Workers": sorted(missing),
                "bare i Workers": sorted(extra),
            }

    assert not differences, differences


def test_every_content_table_carries_its_tenant():
    """organization_id on each, so the scoping check is the same everywhere.

    Denormalised on purpose: reaching the owner through the tree would make
    the check different for each table, and different is where one of them
    ends up wrong.
    """
    ts = workers_schema()
    content = [
        "property", "panel", "module", "circuit", "connectionpoint",
        "equipment", "file", "changelog", "channel",
    ]
    without = [t for t in content if "organization_id" not in ts.get(t, set())]
    assert not without, f"uten organization_id: {without}"
