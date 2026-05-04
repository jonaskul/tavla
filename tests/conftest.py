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
