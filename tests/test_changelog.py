def test_changelog_is_append_only(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(
        "/api/changelog",
        json={
            "circuit_id": circuit["id"],
            "changed_by": "Jonas",
            "description": "Byttet sikring fra B16 til B20",
        },
    )
    assert res.status_code == 200
    log_id = res.json()["id"]

    assert client.delete(f"/api/changelog/{log_id}").status_code == 405
    assert client.put(f"/api/changelog/{log_id}", json={"description": "Endret"}).status_code == 405


def test_changelog_requires_entity(client):
    res = client.post(
        "/api/changelog",
        json={"changed_by": "Jonas", "description": "Noe skjedde"},
    )
    assert res.status_code == 422


def test_changelog_for_circuit(client, circuit_factory):
    circuit = circuit_factory()
    client.post("/api/changelog", json={
        "circuit_id": circuit["id"],
        "changed_by": "Jonas",
        "description": "Byttet sikring",
    })
    res = client.get(f"/api/circuits/{circuit['id']}/changelog")
    assert res.status_code == 200
    entries = res.json()
    assert len(entries) == 1
    assert entries[0]["description"] == "Byttet sikring"


def test_changelog_for_connection_point(client, connection_point_factory):
    cp = connection_point_factory()
    client.post("/api/changelog", json={
        "connection_point_id": cp["id"],
        "changed_by": "Elektriker AS",
        "description": "Koblet opp stikk",
    })
    res = client.get(f"/api/connection_points/{cp['id']}/changelog")
    assert res.status_code == 200
    entries = res.json()
    assert len(entries) == 1
    assert entries[0]["description"] == "Koblet opp stikk"


def test_changelog_newest_first(client, circuit_factory):
    circuit = circuit_factory()
    for i in range(3):
        client.post("/api/changelog", json={
            "circuit_id": circuit["id"],
            "changed_by": "Jonas",
            "description": f"Endring {i}",
        })
    res = client.get(f"/api/circuits/{circuit['id']}/changelog")
    entries = res.json()
    assert entries[0]["description"] == "Endring 2"
    assert entries[2]["description"] == "Endring 0"
