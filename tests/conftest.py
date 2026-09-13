import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

import storage
from auth import set_authenticator, single_user_authenticator
from database import get_session
from main import app
from routers.module_types import seed_builtin_types
from tenancy import bind_organization, bootstrap_single_user_install, ensure_default_organization


# Set TEST_DATABASE_URL to run the whole suite against PostgreSQL instead of
# SQLite, which is the only way to exercise the row-level security policies:
#
#   TEST_DATABASE_URL=postgresql+psycopg://tavla_app:pw@localhost/tavla_test \
#       python -m pytest
#
# Without it the suite uses in-memory SQLite, so a plain checkout needs no
# services running. SQLite has no RLS, so those runs cover the application
# scoping only.
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

_TABLES_NEWEST_FIRST = [t.name for t in reversed(SQLModel.metadata.sorted_tables)]


@pytest.fixture(scope="session")
def _migrated_engine():
    """PostgreSQL only: migrate once for the whole run, including RLS."""
    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
    cfg = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    # attributes, not set_main_option: env.py treats this as the caller's
    # explicit choice and will not override it from the environment.
    cfg.attributes["sqlalchemy.url"] = TEST_DATABASE_URL
    command.upgrade(cfg, "head")
    return engine


@pytest.fixture(autouse=True)
def in_memory_storage(tmp_path):
    """Files go to a temp directory, one per test.

    Nothing here touches R2. The S3 path is covered separately in
    tests/test_storage.py against a stubbed client.
    """
    storage.set_storage(storage.LocalStorage(str(tmp_path / "uploads")))
    yield


@pytest.fixture(name="db_engine")
def db_engine_fixture(request):
    """A database seeded the way a new install would be."""
    if TEST_DATABASE_URL:
        engine = request.getfixturevalue("_migrated_engine")
        # Re-migrating per test would be far too slow, so empty the tables
        # instead. TRUNCATE is not filtered by the RLS policies, so this
        # clears every tenant's rows regardless of the current setting.
        with engine.begin() as conn:
            conn.execute(
                text("TRUNCATE " + ", ".join(_TABLES_NEWEST_FIRST) + " RESTART IDENTITY CASCADE")
            )
    else:
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        bootstrap_single_user_install(session)
        org = ensure_default_organization(session)
        # Seeding writes the shared built-in types, which the RLS policy on
        # moduletypedefinition admits because their organization_id is NULL.
        bind_organization(session, org.id)
        seed_builtin_types(session)
    return engine


@pytest.fixture(name="client")
def client_fixture(db_engine):
    def get_test_session():
        with Session(db_engine) as session:
            yield session

    # Signed in as the install's only user unless a test says otherwise.
    # Production defaults to real login instead, so that a deployment which
    # configures nothing ends up closed rather than open; tests state the
    # mode they want rather than inheriting it.
    set_authenticator(single_user_authenticator)

    app.dependency_overrides[get_session] = get_test_session
    yield TestClient(app)
    app.dependency_overrides.clear()
    set_authenticator(single_user_authenticator)


@pytest.fixture
def property_factory(client):
    def make(name="Testbolig", address="Testveien 1"):
        return client.post("/api/properties", json={"name": name, "address": address}).json()
    return make


@pytest.fixture
def panel_factory(client, property_factory):
    def make():
        prop = property_factory()
        return client.post(
            f"/api/properties/{prop['id']}/panels",
            json={"name": "Hovedtavle", "location": "Gang", "rows": 1, "modules_per_row": 12},
        ).json()
    return make


@pytest.fixture
def circuit_factory(client, panel_factory):
    def make(panel_id=None):
        if panel_id is None:
            panel = panel_factory()
            panel_id = panel["id"]
        return client.post(
            f"/api/panels/{panel_id}/circuits",
            json={"designation": "B01", "name": "Lys stue", "room": "Stue"},
        ).json()
    return make


@pytest.fixture
def module_factory(client, panel_factory):
    def make(panel_id=None, position=0, row=0, width=1, type="breaker", label="B01"):
        if panel_id is None:
            panel = panel_factory()
            panel_id = panel["id"]
        return client.post(f"/api/panels/{panel_id}/modules", json={
            "row": row,
            "position": position,
            "width": width,
            "type": type,
            "label": label,
            "ampere": 16,
        }).json()
    return make


@pytest.fixture
def cp_factory(client, circuit_factory):
    def make(circuit_id=None, type="outlet", location="Stue nord"):
        if circuit_id is None:
            circuit = circuit_factory()
            circuit_id = circuit["id"]
        return client.post(
            f"/api/circuits/{circuit_id}/connection_points",
            json={"type": type, "location": location},
        ).json()
    return make


@pytest.fixture
def connection_point_factory(client, circuit_factory):
    def make(circuit_id=None):
        if circuit_id is None:
            circuit = circuit_factory()
            circuit_id = circuit["id"]
        return client.post(
            f"/api/circuits/{circuit_id}/connection_points",
            json={"type": "junction_box", "location": "Tak stue"},
        ).json()
    return make


@pytest.fixture
def file_factory(client, connection_point_factory):
    import io
    def make(connection_point_id=None):
        if connection_point_id is None:
            cp = connection_point_factory()
            connection_point_id = cp["id"]
        fake_image = io.BytesIO(b"fake jpeg content")
        return client.post(
            f"/api/files/upload?connection_point_id={connection_point_id}",
            files={"file": ("test.jpg", fake_image, "image/jpeg")},
        ).json()
    return make


@pytest.fixture
def equipment_factory(client, circuit_factory):
    def make(circuit_id=None, eq_type="floor_heating", brand="Nexans"):
        if circuit_id is None:
            circuit = circuit_factory()
            circuit_id = circuit["id"]
        return client.post(
            f"/api/circuits/{circuit_id}/equipment",
            json={"type": eq_type, "brand": brand, "watt": 1000},
        ).json()
    return make


@pytest.fixture
def channel_factory(client, equipment_factory):
    def make(equipment_id=None, number=1, **kwargs):
        if equipment_id is None:
            eq = equipment_factory()
            equipment_id = eq["id"]
        return client.post(
            f"/api/equipment/{equipment_id}/channels",
            json={"number": number, **kwargs},
        ).json()
    return make


@pytest.fixture
def equipment_file_factory(client, equipment_factory):
    import io
    def make(equipment_id=None):
        if equipment_id is None:
            eq = equipment_factory()
            equipment_id = eq["id"]
        fake_image = io.BytesIO(b"fake jpeg content")
        return client.post(
            f"/api/equipment/{equipment_id}/files",
            files={"file": ("photo.jpg", fake_image, "image/jpeg")},
        ).json()
    return make
