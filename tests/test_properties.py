def test_create_property(client):
    res = client.post("/api/properties", json={"name": "Hjemme", "address": "Testveien 1, 1640 Råde"})
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Hjemme"
    assert data["id"] is not None


def test_get_properties_empty(client):
    res = client.get("/api/properties")
    assert res.status_code == 200
    assert res.json() == []


def test_get_property_not_found(client):
    res = client.get("/api/properties/999")
    assert res.status_code == 404


def test_update_property(client, property_factory):
    prop = property_factory()
    res = client.put(f"/api/properties/{prop['id']}", json={"name": "Hytta", "address": "Hytteveien 2"})
    assert res.status_code == 200
    assert res.json()["name"] == "Hytta"


def test_delete_property(client, property_factory):
    prop = property_factory()
    res = client.delete(f"/api/properties/{prop['id']}")
    assert res.status_code == 200
    assert client.get(f"/api/properties/{prop['id']}").status_code == 404


def test_delete_property_with_panels_blocked(client, panel_factory):
    panel = panel_factory()
    res = client.delete(f"/api/properties/{panel['property_id']}")
    assert res.status_code in [400, 409]
