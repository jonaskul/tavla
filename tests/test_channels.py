import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_equipment(client, circuit_id, **kwargs):
    payload = {"type": "dynalite", **kwargs}
    return client.post(f"/api/circuits/{circuit_id}/equipment", json=payload).json()


def _make_channel(client, equipment_id, number=1, **kwargs):
    return client.post(
        f"/api/equipment/{equipment_id}/channels",
        json={"number": number, **kwargs},
    )


# ---------------------------------------------------------------------------
# List / create
# ---------------------------------------------------------------------------

def test_list_channels_empty(client, equipment_factory):
    eq = equipment_factory()
    res = client.get(f"/api/equipment/{eq['id']}/channels")
    assert res.status_code == 200
    assert res.json() == []


def test_create_channel(client, equipment_factory):
    eq = equipment_factory()
    res = _make_channel(client, eq["id"], 1, label="Lys stue", load="6x LED 9W", notes="test")
    assert res.status_code == 200
    data = res.json()
    assert data["number"] == 1
    assert data["label"] == "Lys stue"
    assert data["load"] == "6x LED 9W"
    assert data["equipment_id"] == eq["id"]
    assert data["circuit_id"] is None


def test_list_channels_sorted(client, equipment_factory):
    eq = equipment_factory()
    for n in [5, 3, 1, 4, 2]:
        _make_channel(client, eq["id"], n)
    channels = client.get(f"/api/equipment/{eq['id']}/channels").json()
    assert [c["number"] for c in channels] == [1, 2, 3, 4, 5]


def test_equipment_not_found_list(client):
    res = client.get("/api/equipment/99999/channels")
    assert res.status_code == 404


def test_equipment_not_found_create(client):
    res = _make_channel(client, 99999, 1)
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# Duplicate number
# ---------------------------------------------------------------------------

def test_duplicate_number_rejected(client, equipment_factory):
    eq = equipment_factory()
    r1 = _make_channel(client, eq["id"], 1)
    assert r1.status_code == 200
    r2 = _make_channel(client, eq["id"], 1)
    assert r2.status_code == 400


def test_duplicate_number_per_equipment_not_global(client, equipment_factory):
    """Same number on two different equipment items is allowed."""
    eq1 = equipment_factory()
    eq2 = equipment_factory()
    assert _make_channel(client, eq1["id"], 1).status_code == 200
    assert _make_channel(client, eq2["id"], 1).status_code == 200


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

def test_update_channel_fields(client, equipment_factory):
    eq = equipment_factory()
    ch = _make_channel(client, eq["id"], 1).json()
    res = client.put(f"/api/channels/{ch['id']}", json={"label": "Gang", "load": "2x LED", "notes": "n"})
    assert res.status_code == 200
    data = res.json()
    assert data["label"] == "Gang"
    assert data["load"] == "2x LED"
    assert data["notes"] == "n"


def test_update_channel_links_circuit(client, equipment_factory, circuit_factory):
    eq = equipment_factory()
    ch = _make_channel(client, eq["id"], 1).json()
    circuit = circuit_factory()
    res = client.put(f"/api/channels/{ch['id']}", json={"circuit_id": circuit["id"]})
    assert res.status_code == 200
    assert res.json()["circuit_id"] == circuit["id"]


def test_update_channel_invalid_circuit(client, equipment_factory):
    eq = equipment_factory()
    ch = _make_channel(client, eq["id"], 1).json()
    res = client.put(f"/api/channels/{ch['id']}", json={"circuit_id": 99999})
    assert res.status_code == 404


def test_update_channel_unlinks_circuit(client, equipment_factory, circuit_factory):
    eq = equipment_factory()
    circuit = circuit_factory()
    ch = _make_channel(client, eq["id"], 1).json()
    client.put(f"/api/channels/{ch['id']}", json={"circuit_id": circuit["id"]})
    res = client.put(f"/api/channels/{ch['id']}", json={"circuit_id": None})
    assert res.status_code == 200
    assert res.json()["circuit_id"] is None


def test_channel_not_found_update(client):
    res = client.put("/api/channels/99999", json={"label": "x"})
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

def test_delete_channel(client, equipment_factory):
    eq = equipment_factory()
    ch = _make_channel(client, eq["id"], 1).json()
    res = client.delete(f"/api/channels/{ch['id']}")
    assert res.status_code == 200
    assert client.get(f"/api/equipment/{eq['id']}/channels").json() == []


def test_channel_not_found_delete(client):
    res = client.delete("/api/channels/99999")
    assert res.status_code == 404


def test_delete_channel_leaves_equipment_intact(client, equipment_factory):
    eq = equipment_factory()
    ch = _make_channel(client, eq["id"], 1).json()
    client.delete(f"/api/channels/{ch['id']}")
    res = client.get(f"/api/equipment/{eq['id']}")
    assert res.status_code == 200
    assert res.json()["id"] == eq["id"]


# ---------------------------------------------------------------------------
# Auto-generation via channel_count
# ---------------------------------------------------------------------------

def test_channel_auto_generated(client, circuit_factory):
    circuit = circuit_factory()
    eq = _make_equipment(client, circuit["id"], channel_count=3)
    channels = client.get(f"/api/equipment/{eq['id']}/channels").json()
    assert len(channels) == 3
    assert [c["number"] for c in channels] == [1, 2, 3]
    assert all(c["label"] is None for c in channels)
    assert all(c["load"] is None for c in channels)
    assert all(c["circuit_id"] is None for c in channels)


def test_auto_channels_ordered(client, circuit_factory):
    circuit = circuit_factory()
    eq = _make_equipment(client, circuit["id"], channel_count=5)
    channels = client.get(f"/api/equipment/{eq['id']}/channels").json()
    assert [c["number"] for c in channels] == [1, 2, 3, 4, 5]


def test_channel_count_zero_creates_none(client, circuit_factory):
    circuit = circuit_factory()
    eq = _make_equipment(client, circuit["id"], channel_count=0)
    assert client.get(f"/api/equipment/{eq['id']}/channels").json() == []


def test_channel_count_not_in_equipment_response(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(
        f"/api/circuits/{circuit['id']}/equipment",
        json={"type": "dynalite", "channel_count": 12},
    )
    assert res.status_code == 200
    assert "channel_count" not in res.json()


def test_channel_auto_generated_flat_endpoint(client, circuit_factory):
    """channel_count also works via flat POST /api/equipment."""
    circuit = circuit_factory()
    res = client.post(
        "/api/equipment",
        json={"type": "shelly", "circuit_id": circuit["id"], "channel_count": 4},
    )
    assert res.status_code == 200
    channels = client.get(f"/api/equipment/{res.json()['id']}/channels").json()
    assert len(channels) == 4
