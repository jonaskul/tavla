def test_create_panel(client, property_factory):
    prop = property_factory()
    res = client.post(
        f"/api/properties/{prop['id']}/panels",
        json={"name": "Hovedtavle", "location": "Gang 1. etg", "rows": 2, "modules_per_row": 12},
    )
    assert res.status_code == 200
    assert res.json()["rows"] == 2


def test_create_panel_invalid_property(client):
    res = client.post(
        "/api/properties/999/panels",
        json={"name": "Tavle", "location": "Gang", "rows": 1, "modules_per_row": 12},
    )
    assert res.status_code == 404


def test_delete_panel_with_circuits_blocked(client, circuit_factory):
    circuit = circuit_factory()
    res = client.delete(f"/api/panels/{circuit['panel_id']}")
    assert res.status_code in [400, 409]
