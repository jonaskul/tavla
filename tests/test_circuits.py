def test_create_circuit(client, panel_factory):
    panel = panel_factory()
    res = client.post(
        f"/api/panels/{panel['id']}/circuits",
        json={
            "designation": "B01",
            "name": "Lys stue",
            "room": "Stue",
            "cable_type": "NYM-J",
            "cross_section": 1.5,
            "conductor_count": 3,
            "length_m": 12.0,
        },
    )
    assert res.status_code == 200
    assert res.json()["designation"] == "B01"


def test_duplicate_designation_in_same_panel(client, panel_factory):
    panel = panel_factory()
    payload = {"designation": "B01", "name": "Lys", "room": "Stue"}
    client.post(f"/api/panels/{panel['id']}/circuits", json=payload)
    res = client.post(f"/api/panels/{panel['id']}/circuits", json=payload)
    assert res.status_code == 400


def test_same_designation_different_panels(client, panel_factory):
    p1, p2 = panel_factory(), panel_factory()
    payload = {"designation": "B01", "name": "Lys", "room": "Stue"}
    r1 = client.post(f"/api/panels/{p1['id']}/circuits", json=payload)
    r2 = client.post(f"/api/panels/{p2['id']}/circuits", json=payload)
    assert r1.status_code == 200
    assert r2.status_code == 200
