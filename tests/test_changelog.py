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
