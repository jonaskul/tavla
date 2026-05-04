"""Phase 4C tests: channel_type/watt, module is_vacant, main_switch type."""
import pytest


# ---------------------------------------------------------------------------
# Channel: channel_type and watt
# ---------------------------------------------------------------------------

def _make_channel(client, equipment_id, number=1, **kwargs):
    return client.post(
        f"/api/equipment/{equipment_id}/channels",
        json={"number": number, **kwargs},
    )


def test_channel_default_type_is_relay(client, equipment_factory):
    eq = equipment_factory()
    ch = _make_channel(client, eq["id"]).json()
    assert ch["channel_type"] == "relay"
    assert ch["watt"] is None


def test_channel_create_with_dimmer_type(client, equipment_factory):
    eq = equipment_factory()
    ch = _make_channel(client, eq["id"], channel_type="dimmer", watt=200).json()
    assert ch["channel_type"] == "dimmer"
    assert ch["watt"] == 200


def test_channel_update_channel_type(client, equipment_factory):
    eq = equipment_factory()
    ch = _make_channel(client, eq["id"]).json()
    assert ch["channel_type"] == "relay"
    res = client.put(f"/api/channels/{ch['id']}", json={"channel_type": "dimmer"})
    assert res.status_code == 200
    assert res.json()["channel_type"] == "dimmer"


def test_channel_update_watt(client, equipment_factory):
    eq = equipment_factory()
    ch = _make_channel(client, eq["id"]).json()
    res = client.put(f"/api/channels/{ch['id']}", json={"watt": 500})
    assert res.status_code == 200
    assert res.json()["watt"] == 500


def test_channel_update_watt_to_none(client, equipment_factory):
    eq = equipment_factory()
    ch = _make_channel(client, eq["id"], watt=100).json()
    res = client.put(f"/api/channels/{ch['id']}", json={"watt": None})
    assert res.status_code == 200
    assert res.json()["watt"] is None


def test_channel_invalid_channel_type_rejected(client, equipment_factory):
    eq = equipment_factory()
    res = _make_channel(client, eq["id"], channel_type="invalid_type")
    assert res.status_code == 422


def test_channel_auto_generated_default_relay(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(
        f"/api/circuits/{circuit['id']}/equipment",
        json={"type": "dynalite", "channel_count": 2},
    )
    eq = res.json()
    channels = client.get(f"/api/equipment/{eq['id']}/channels").json()
    assert all(c["channel_type"] == "relay" for c in channels)
    assert all(c["watt"] is None for c in channels)


# ---------------------------------------------------------------------------
# Module: is_vacant
# ---------------------------------------------------------------------------

def test_create_vacant_module(client, panel_factory):
    panel = panel_factory()
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1, "type": "other", "is_vacant": True,
    })
    assert res.status_code == 200
    data = res.json()
    assert data["is_vacant"] is True


def test_create_module_default_not_vacant(client, panel_factory):
    panel = panel_factory()
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1, "type": "breaker",
    })
    assert res.status_code == 200
    assert res.json()["is_vacant"] is False


def test_vacant_with_circuit_id_rejected_on_create(client, panel_factory, circuit_factory):
    panel = panel_factory()
    circuit = circuit_factory()
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1, "type": "breaker",
        "is_vacant": True, "circuit_id": circuit["id"],
    })
    assert res.status_code == 400


def test_vacant_with_circuit_id_rejected_on_update(client, module_factory, circuit_factory):
    module = module_factory()
    circuit = circuit_factory()
    res = client.put(f"/api/modules/{module['id']}", json={
        "is_vacant": True, "circuit_id": circuit["id"],
    })
    assert res.status_code == 400


def test_update_module_set_vacant(client, module_factory):
    module = module_factory()
    res = client.put(f"/api/modules/{module['id']}", json={"is_vacant": True})
    assert res.status_code == 200
    assert res.json()["is_vacant"] is True


def test_update_module_clear_vacant(client, panel_factory):
    panel = panel_factory()
    m = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1, "type": "other", "is_vacant": True,
    }).json()
    res = client.put(f"/api/modules/{m['id']}", json={"is_vacant": False})
    assert res.status_code == 200
    assert res.json()["is_vacant"] is False


def test_vacant_module_still_blocks_overlap(client, panel_factory):
    panel = panel_factory()
    client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 2, "type": "other", "is_vacant": True,
    })
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 1, "width": 1, "type": "breaker",
    })
    assert res.status_code == 409


# ---------------------------------------------------------------------------
# Module: main_switch type
# ---------------------------------------------------------------------------

def test_create_main_switch_module(client, panel_factory):
    panel = panel_factory()
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 2, "type": "main_switch", "ampere": 50,
    })
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "main_switch"
    assert data["ampere"] == 50


def test_main_switch_with_circuit_id_rejected_on_create(client, panel_factory, circuit_factory):
    panel = panel_factory()
    circuit = circuit_factory()
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 2, "type": "main_switch",
        "circuit_id": circuit["id"],
    })
    assert res.status_code == 400


def test_main_switch_with_circuit_id_rejected_on_update(client, panel_factory, circuit_factory):
    panel = panel_factory()
    m = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 2, "type": "main_switch",
    }).json()
    circuit = circuit_factory()
    res = client.put(f"/api/modules/{m['id']}", json={"circuit_id": circuit["id"]})
    assert res.status_code == 400


def test_update_to_main_switch_with_existing_circuit_rejected(client, module_factory, circuit_factory):
    """Changing type to main_switch on a module that already has circuit_id → 400."""
    module = module_factory(type="breaker")
    circuit = circuit_factory()
    client.put(f"/api/modules/{module['id']}", json={"circuit_id": circuit["id"]})
    res = client.put(f"/api/modules/{module['id']}", json={"type": "main_switch"})
    assert res.status_code == 400


def test_main_switch_module_without_circuit_ok(client, panel_factory):
    panel = panel_factory()
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 2, "type": "main_switch",
    })
    assert res.status_code == 200
    assert res.json()["circuit_id"] is None
