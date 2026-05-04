import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

from database import get_session
from main import app


@pytest.fixture(name="client")
def client_fixture():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    def get_test_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = get_test_session
    yield TestClient(app)
    app.dependency_overrides.clear()


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
    def make():
        panel = panel_factory()
        return client.post(
            f"/api/panels/{panel['id']}/circuits",
            json={"designation": "B01", "name": "Lys stue", "room": "Stue"},
        ).json()
    return make
