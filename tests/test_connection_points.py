import io


def test_create_connection_point(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(
        f"/api/circuits/{circuit['id']}/connection_points",
        json={"type": "outlet", "location": "Stue nord", "notes": "Under vindu"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "outlet"
    assert data["location"] == "Stue nord"
    assert data["circuit_id"] == circuit["id"]


def test_list_connection_points_for_circuit(client, circuit_factory):
    circuit = circuit_factory()
    client.post(
        f"/api/circuits/{circuit['id']}/connection_points",
        json={"type": "outlet", "location": "Stue"},
    )
    client.post(
        f"/api/circuits/{circuit['id']}/connection_points",
        json={"type": "light", "location": "Gang"},
    )
    res = client.get(f"/api/circuits/{circuit['id']}/connection_points")
    assert res.status_code == 200
    assert len(res.json()) == 2


def test_create_auto_logs_changelog(client, circuit_factory):
    circuit = circuit_factory()
    client.post(
        f"/api/circuits/{circuit['id']}/connection_points",
        json={"type": "outlet", "location": "Kjøkken"},
    )
    log_res = client.get("/api/changelog", params={"circuit_id": circuit["id"]})
    assert log_res.status_code == 200
    entries = log_res.json()
    assert len(entries) >= 1
    assert "opprettet" in entries[0]["description"].lower()


def test_update_connection_point(client, cp_factory):
    cp = cp_factory()
    res = client.put(
        f"/api/connection_points/{cp['id']}",
        json={"location": "Kjøkken sør"},
    )
    assert res.status_code == 200
    assert res.json()["location"] == "Kjøkken sør"


def test_update_auto_logs_changelog(client, circuit_factory, cp_factory):
    circuit = circuit_factory()
    cp = cp_factory(circuit_id=circuit["id"])
    client.put(f"/api/connection_points/{cp['id']}", json={"location": "Nytt rom"})
    log_res = client.get("/api/changelog", params={"circuit_id": circuit["id"]})
    descriptions = [e["description"].lower() for e in log_res.json()]
    assert any("oppdatert" in d for d in descriptions)


def test_delete_connection_point(client, cp_factory):
    cp = cp_factory()
    res = client.delete(f"/api/connection_points/{cp['id']}")
    assert res.status_code == 200
    assert client.get(f"/api/connection_points/{cp['id']}").status_code == 404


def test_delete_auto_logs_changelog(client, circuit_factory, cp_factory):
    circuit = circuit_factory()
    cp = cp_factory(circuit_id=circuit["id"])
    client.delete(f"/api/connection_points/{cp['id']}")
    log_res = client.get("/api/changelog", params={"circuit_id": circuit["id"]})
    descriptions = [e["description"].lower() for e in log_res.json()]
    assert any("slettet" in d for d in descriptions)


def test_delete_blocked_when_has_files(client, cp_factory):
    cp = cp_factory()
    jpeg = b"\xff\xd8\xff" + b"\x00" * 100
    client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("test.jpg", io.BytesIO(jpeg), "image/jpeg")},
    )
    res = client.delete(f"/api/connection_points/{cp['id']}")
    assert res.status_code == 409


def test_list_files_for_connection_point(client, cp_factory):
    cp = cp_factory()
    jpeg = b"\xff\xd8\xff" + b"\x00" * 100
    client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("photo.jpg", io.BytesIO(jpeg), "image/jpeg")},
    )
    res = client.get(f"/api/connection_points/{cp['id']}/files")
    assert res.status_code == 200
    assert len(res.json()) == 1


def test_circuit_404_for_connection_points(client):
    res = client.get("/api/circuits/999/connection_points")
    assert res.status_code == 404
