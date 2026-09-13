"""Kurser, koblingspunkter, utstyr og kanaler."""


# --- Circuits -------------------------------------------------------------

def test_create_a_circuit_under_a_panel(api, make_panel):
    panel = make_panel()
    res = api.post(f"/api/panels/{panel['id']}/circuits", json={
        "designation": "B05", "name": "Stikk kjøkken", "room": "Kjøkken",
        "cable_type": "PFXP", "cross_section": 2.5, "conductor_count": 3,
        "length_m": 14.5, "notes": "Langs taket",
    })
    assert res.status_code == 200
    body = res.json()
    assert body["panel_id"] == panel["id"]
    assert body["cable_type"] == "PFXP"
    assert body["cross_section"] == 2.5


def test_a_circuit_can_be_created_flat_as_well(api, make_panel):
    panel = make_panel()
    res = api.post("/api/circuits", json={
        "panel_id": panel["id"], "designation": "B09", "name": "Vaskerom",
    })
    assert res.status_code == 200


def test_circuits_are_listed_per_panel_and_globally(api, make_panel, make_circuit):
    panel = make_panel()
    circuit = make_circuit(panel_id=panel["id"])

    per_panel = api.get(f"/api/panels/{panel['id']}/circuits")
    assert per_panel.status_code == 200
    assert circuit["id"] in [c["id"] for c in per_panel.json()]

    listed = api.get("/api/circuits", params={"panel_id": panel["id"]})
    assert listed.status_code == 200
    assert circuit["id"] in [c["id"] for c in listed.json()]


def test_read_and_update_a_circuit(api, make_circuit):
    circuit = make_circuit()
    assert api.get(f"/api/circuits/{circuit['id']}").status_code == 200

    res = api.put(f"/api/circuits/{circuit['id']}", json={"room": "Bod"})
    assert res.status_code == 200
    assert res.json()["room"] == "Bod"


def test_a_designation_cannot_repeat_within_a_panel(api, make_panel, make_circuit):
    panel = make_panel()
    make_circuit(panel_id=panel["id"], designation="B01")
    res = api.post(f"/api/panels/{panel['id']}/circuits", json={
        "designation": "B01", "name": "Duplikat",
    })
    assert res.status_code == 400


def test_delete_a_bare_circuit(api, make_circuit):
    circuit = make_circuit()
    assert api.delete(f"/api/circuits/{circuit['id']}").status_code == 200


def test_a_circuit_with_connection_points_refuses_to_be_deleted(
    api, make_circuit, make_connection_point
):
    circuit = make_circuit()
    make_connection_point(circuit_id=circuit["id"])
    assert api.delete(f"/api/circuits/{circuit['id']}").status_code == 409


def test_a_circuit_with_equipment_refuses_to_be_deleted(api, make_circuit, make_equipment):
    """This returned 500 until recently — the guard covered connection
    points and forgot equipment."""
    circuit = make_circuit()
    make_equipment(circuit_id=circuit["id"])
    assert api.delete(f"/api/circuits/{circuit['id']}").status_code == 409


def test_deleting_a_circuit_releases_the_modules_that_referenced_it(
    api, make_panel, make_circuit
):
    """Otherwise the panel view keeps drawing a breaker wired to nothing."""
    panel = make_panel()
    circuit = make_circuit(panel_id=panel["id"])
    api.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 2, "type": "breaker",
        "circuit_id": circuit["id"],
    })

    assert api.delete(f"/api/circuits/{circuit['id']}").status_code == 200

    modules = api.get(f"/api/panels/{panel['id']}/modules").json()
    assert all(m["circuit_id"] != circuit["id"] for m in modules)


# --- Connection points ----------------------------------------------------

def test_create_read_update_a_connection_point(api, make_circuit):
    circuit = make_circuit()
    created = api.post(f"/api/circuits/{circuit['id']}/connection_points", json={
        "type": "light", "location": "Tak stue", "notes": "Dimbar",
    })
    assert created.status_code == 200
    cp = created.json()
    assert cp["type"] == "light"

    assert api.get(f"/api/connection_points/{cp['id']}").status_code == 200

    updated = api.put(f"/api/connection_points/{cp['id']}", json={"location": "Tak gang"})
    assert updated.status_code == 200
    assert updated.json()["location"] == "Tak gang"


def test_a_connection_point_can_be_created_flat(api, make_circuit):
    circuit = make_circuit()
    res = api.post("/api/connection_points", json={
        "circuit_id": circuit["id"], "type": "switch", "location": "Ved dør",
    })
    assert res.status_code == 200


def test_connection_points_are_listed_per_circuit_and_globally(
    api, make_circuit, make_connection_point
):
    circuit = make_circuit()
    cp = make_connection_point(circuit_id=circuit["id"])

    per_circuit = api.get(f"/api/circuits/{circuit['id']}/connection_points")
    assert cp["id"] in [c["id"] for c in per_circuit.json()]

    listed = api.get("/api/connection_points", params={"circuit_id": circuit["id"]})
    assert listed.status_code == 200
    assert cp["id"] in [c["id"] for c in listed.json()]


def test_delete_a_connection_point(api, make_connection_point):
    cp = make_connection_point()
    assert api.delete(f"/api/connection_points/{cp['id']}").status_code == 200


def test_a_connection_point_with_files_refuses_to_be_deleted(
    api, make_connection_point, upload
):
    cp = make_connection_point()
    upload(connection_point_id=cp["id"])
    assert api.delete(f"/api/connection_points/{cp['id']}").status_code == 409


# --- Equipment ------------------------------------------------------------

def test_create_read_update_equipment(api, make_circuit):
    circuit = make_circuit()
    created = api.post(f"/api/circuits/{circuit['id']}/equipment", json={
        "type": "ev_charger", "brand": "Easee", "model": "Home",
        "watt": 7400, "notes": "Utvendig",
    })
    assert created.status_code == 200
    eq = created.json()
    assert eq["type"] == "ev_charger"
    assert eq["watt"] == 7400

    assert api.get(f"/api/equipment/{eq['id']}").status_code == 200

    updated = api.put(f"/api/equipment/{eq['id']}", json={"watt": 11000})
    assert updated.status_code == 200
    assert updated.json()["watt"] == 11000


def test_equipment_can_be_created_flat(api, make_circuit):
    circuit = make_circuit()
    res = api.post("/api/equipment", json={
        "circuit_id": circuit["id"], "type": "heat_pump", "brand": "Mitsubishi",
    })
    assert res.status_code == 200


def test_equipment_is_listed_per_circuit_and_globally(api, make_circuit, make_equipment):
    circuit = make_circuit()
    eq = make_equipment(circuit_id=circuit["id"])

    per_circuit = api.get(f"/api/circuits/{circuit['id']}/equipment")
    assert eq["id"] in [e["id"] for e in per_circuit.json()]

    listed = api.get("/api/equipment", params={"circuit_id": circuit["id"]})
    assert listed.status_code == 200
    assert eq["id"] in [e["id"] for e in listed.json()]


def test_equipment_can_be_created_with_channels_in_one_go(api, make_circuit):
    circuit = make_circuit()
    res = api.post(f"/api/circuits/{circuit['id']}/equipment", json={
        "type": "dynalite", "brand": "Philips", "channel_count": 4,
    })
    assert res.status_code == 200
    channels = api.get(f"/api/equipment/{res.json()['id']}/channels").json()
    assert len(channels) == 4
    assert [c["number"] for c in channels] == [1, 2, 3, 4]


def test_deleting_equipment_takes_its_channels_with_it(api, make_equipment, make_channel):
    """Channels are equipment detail, not standalone records.

    This returned 500 until recently: nothing declared the cascade, so the
    delete tried to orphan the channels against a NOT NULL column.
    """
    eq = make_equipment()
    make_channel(equipment_id=eq["id"], number=1)
    make_channel(equipment_id=eq["id"], number=2)

    assert api.delete(f"/api/equipment/{eq['id']}").status_code == 200
    assert api.get(f"/api/equipment/{eq['id']}").status_code == 404


def test_equipment_with_files_refuses_to_be_deleted(api, make_equipment, upload):
    eq = make_equipment()
    upload(equipment_id=eq["id"])
    assert api.delete(f"/api/equipment/{eq['id']}").status_code == 409


# --- Channels -------------------------------------------------------------

def test_add_and_update_a_channel(api, make_equipment):
    eq = make_equipment()
    created = api.post(f"/api/equipment/{eq['id']}/channels", json={
        "number": 1, "label": "Downlights", "load": "12 spots",
        "watt": 240, "channel_type": "dimmer",
    })
    assert created.status_code == 200
    channel = created.json()
    assert channel["channel_type"] == "dimmer"

    updated = api.put(f"/api/channels/{channel['id']}", json={"watt": 300})
    assert updated.status_code == 200
    assert updated.json()["watt"] == 300


def test_a_channel_number_cannot_repeat_on_the_same_equipment(api, make_equipment, make_channel):
    eq = make_equipment()
    make_channel(equipment_id=eq["id"], number=1)
    res = api.post(f"/api/equipment/{eq['id']}/channels", json={"number": 1})
    assert res.status_code == 400


def test_a_channel_can_serve_a_circuit_other_than_its_equipments(
    api, make_panel, make_circuit, make_equipment
):
    """Not derivable from the nesting, so it is a real reference."""
    panel = make_panel()
    own = make_circuit(panel_id=panel["id"], designation="B20")
    other = make_circuit(panel_id=panel["id"], designation="B21")
    eq = make_equipment(circuit_id=own["id"])

    res = api.post(f"/api/equipment/{eq['id']}/channels", json={
        "number": 1, "circuit_id": other["id"],
    })
    assert res.status_code == 200
    assert res.json()["circuit_id"] == other["id"]


def test_delete_a_channel(api, make_channel):
    channel = make_channel()
    assert api.delete(f"/api/channels/{channel['id']}").status_code == 200
