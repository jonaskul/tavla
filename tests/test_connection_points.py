import io


def test_create_connection_point(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(f"/api/circuits/{circuit['id']}/connection_points", json={
        "type": "junction_box",
        "location": "Tak stue ved balkongdør",
        "notes": "Fordeler til 3 punkter",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "junction_box"
    assert data["location"] == "Tak stue ved balkongdør"


def test_get_connection_points_empty(client, circuit_factory):
    circuit = circuit_factory()
    res = client.get(f"/api/circuits/{circuit['id']}/connection_points")
    assert res.status_code == 200
    assert res.json() == []


def test_update_connection_point(client, connection_point_factory):
    cp = connection_point_factory()
    res = client.put(f"/api/connection_points/{cp['id']}", json={
        **cp, "location": "Oppdatert plassering",
    })
    assert res.status_code == 200
    assert res.json()["location"] == "Oppdatert plassering"


def test_delete_connection_point(client, connection_point_factory):
    cp = connection_point_factory()
    res = client.delete(f"/api/connection_points/{cp['id']}")
    assert res.status_code == 200


def test_delete_connection_point_with_files_blocked(client, file_factory):
    file = file_factory()
    cp_id = file["connection_point_id"]
    res = client.delete(f"/api/connection_points/{cp_id}")
    assert res.status_code in [400, 409]


def test_invalid_connection_point_type(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(f"/api/circuits/{circuit['id']}/connection_points", json={
        "type": "ugyldig_type",
        "location": "Tak",
    })
    assert res.status_code == 422


# --- Additional tests ---

def test_list_connection_points_for_circuit(client, circuit_factory):
    circuit = circuit_factory()
    client.post(f"/api/circuits/{circuit['id']}/connection_points",
                json={"type": "outlet", "location": "Stue"})
    client.post(f"/api/circuits/{circuit['id']}/connection_points",
                json={"type": "light", "location": "Gang"})
    res = client.get(f"/api/circuits/{circuit['id']}/connection_points")
    assert res.status_code == 200
    assert len(res.json()) == 2


def test_create_auto_logs_changelog(client, circuit_factory):
    circuit = circuit_factory()
    client.post(f"/api/circuits/{circuit['id']}/connection_points",
                json={"type": "outlet", "location": "Kjøkken"})
    log_res = client.get("/api/changelog", params={"circuit_id": circuit["id"]})
    assert log_res.status_code == 200
    entries = log_res.json()
    assert len(entries) >= 1
    assert "opprettet" in entries[0]["description"].lower()


def test_update_auto_logs_changelog(client, connection_point_factory, circuit_factory):
    circuit = circuit_factory()
    cp = connection_point_factory(circuit_id=circuit["id"])
    client.put(f"/api/connection_points/{cp['id']}", json={"location": "Nytt rom"})
    log_res = client.get("/api/changelog", params={"circuit_id": circuit["id"]})
    descriptions = [e["description"].lower() for e in log_res.json()]
    assert any("oppdatert" in d for d in descriptions)


def test_delete_auto_logs_changelog(client, connection_point_factory, circuit_factory):
    circuit = circuit_factory()
    cp = connection_point_factory(circuit_id=circuit["id"])
    client.delete(f"/api/connection_points/{cp['id']}")
    log_res = client.get("/api/changelog", params={"circuit_id": circuit["id"]})
    descriptions = [e["description"].lower() for e in log_res.json()]
    assert any("slettet" in d for d in descriptions)


def test_list_files_for_connection_point(client, connection_point_factory):
    cp = connection_point_factory()
    jpeg = b"\xff\xd8\xff" + b"\x00" * 100
    client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("photo.jpg", io.BytesIO(jpeg), "image/jpeg")},
    )
    res = client.get(f"/api/connection_points/{cp['id']}/files")
    assert res.status_code == 200
    assert len(res.json()) == 1
