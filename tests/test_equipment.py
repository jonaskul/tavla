import io


def test_create_equipment(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(f"/api/circuits/{circuit['id']}/equipment", json={
        "type": "floor_heating",
        "brand": "Nexans",
        "model": "TXLP/2R",
        "watt": 1200,
        "notes": "Under fliser i bad",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "floor_heating"
    assert data["brand"] == "Nexans"
    assert data["watt"] == 1200


def test_list_equipment_for_circuit(client, circuit_factory):
    circuit = circuit_factory()
    client.post(f"/api/circuits/{circuit['id']}/equipment", json={"type": "boiler"})
    client.post(f"/api/circuits/{circuit['id']}/equipment", json={"type": "heat_pump"})
    res = client.get(f"/api/circuits/{circuit['id']}/equipment")
    assert res.status_code == 200
    assert len(res.json()) == 2


def test_list_equipment_empty(client, circuit_factory):
    circuit = circuit_factory()
    res = client.get(f"/api/circuits/{circuit['id']}/equipment")
    assert res.status_code == 200
    assert res.json() == []


def test_update_equipment(client, equipment_factory):
    eq = equipment_factory()
    res = client.put(f"/api/equipment/{eq['id']}", json={"watt": 2000, "model": "TXLP/1R"})
    assert res.status_code == 200
    data = res.json()
    assert data["watt"] == 2000
    assert data["model"] == "TXLP/1R"


def test_delete_equipment(client, equipment_factory):
    eq = equipment_factory()
    res = client.delete(f"/api/equipment/{eq['id']}")
    assert res.status_code == 200


def test_delete_equipment_with_files_blocked(client, equipment_file_factory):
    file = equipment_file_factory()
    eq_id = file["equipment_id"]
    res = client.delete(f"/api/equipment/{eq_id}")
    assert res.status_code == 409


def test_invalid_equipment_type(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(f"/api/circuits/{circuit['id']}/equipment", json={"type": "invalid_type"})
    assert res.status_code == 422


def test_create_logs_changelog(client, circuit_factory):
    circuit = circuit_factory()
    client.post(f"/api/circuits/{circuit['id']}/equipment",
                json={"type": "ev_charger", "brand": "Zaptec", "model": "Pro"})
    log = client.get("/api/changelog", params={"circuit_id": circuit["id"]}).json()
    assert any("opprettet" in e["description"].lower() for e in log)
    assert any("elbillader" in e["description"].lower() for e in log)


def test_delete_logs_changelog(client, equipment_factory, circuit_factory):
    circuit = circuit_factory()
    eq = equipment_factory(circuit_id=circuit["id"], eq_type="boiler")
    client.delete(f"/api/equipment/{eq['id']}")
    log = client.get("/api/changelog", params={"circuit_id": circuit["id"]}).json()
    assert any("slettet" in e["description"].lower() for e in log)


def test_upload_file_for_equipment(client, equipment_factory):
    eq = equipment_factory()
    jpeg = b"\xff\xd8\xff" + b"\x00" * 100
    res = client.post(
        f"/api/equipment/{eq['id']}/files",
        files={"file": ("photo.jpg", io.BytesIO(jpeg), "image/jpeg")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["equipment_id"] == eq["id"]
    assert data["filename"] == "photo.jpg"


def test_list_files_for_equipment(client, equipment_file_factory):
    file = equipment_file_factory()
    eq_id = file["equipment_id"]
    res = client.get(f"/api/equipment/{eq_id}/files")
    assert res.status_code == 200
    assert len(res.json()) == 1


def test_dual_parent_rejected(client, connection_point_factory, equipment_factory):
    cp = connection_point_factory()
    eq = equipment_factory()
    fake = io.BytesIO(b"fake jpeg content")
    res = client.post(
        f"/api/files/upload?connection_point_id={cp['id']}&equipment_id={eq['id']}",
        files={"file": ("test.jpg", fake, "image/jpeg")},
    )
    assert res.status_code == 400


def test_equipment_file_stored_under_equipment_dir(client, equipment_factory):
    eq = equipment_factory()
    jpeg = b"\xff\xd8\xff" + b"\x00" * 100
    res = client.post(
        f"/api/equipment/{eq['id']}/files",
        files={"file": ("shot.jpg", io.BytesIO(jpeg), "image/jpeg")},
    )
    assert res.status_code == 200
    local_path = res.json()["local_path"]
    assert f"equipment/{eq['id']}" in local_path.replace("\\", "/")
