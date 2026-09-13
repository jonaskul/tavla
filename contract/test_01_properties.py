"""Anlegg, skap og moduler — the tree everything else hangs from."""


def test_health_is_public_and_says_ok(api):
    res = api.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_me_reports_the_caller(api):
    res = api.get("/api/auth/me")
    assert res.status_code == 200
    body = res.json()
    assert "email" in body
    assert isinstance(body.get("organizations"), list)


# --- Properties -----------------------------------------------------------

def test_create_and_read_a_property(api):
    created = api.post("/api/properties", json={
        "name": "Bolig A", "address": "Veien 1",
    })
    assert created.status_code == 200
    body = created.json()
    assert body["name"] == "Bolig A"
    assert body["address"] == "Veien 1"
    assert isinstance(body["id"], int)

    fetched = api.get(f"/api/properties/{body['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == body["id"]


def test_list_properties_includes_what_was_created(api, make_property):
    created = make_property(name="Bolig i lista")
    listing = api.get("/api/properties")
    assert listing.status_code == 200
    assert created["id"] in [p["id"] for p in listing.json()]


def test_update_a_property(api, make_property):
    prop = make_property()
    res = api.put(f"/api/properties/{prop['id']}", json={"name": "Nytt navn"})
    assert res.status_code == 200
    assert res.json()["name"] == "Nytt navn"
    # The field that was not sent is untouched.
    assert res.json()["address"] == prop["address"]


def test_delete_an_empty_property(api, make_property):
    prop = make_property()
    assert api.delete(f"/api/properties/{prop['id']}").status_code == 200
    assert api.get(f"/api/properties/{prop['id']}").status_code == 404


def test_a_property_with_panels_refuses_to_be_deleted(api, make_property, make_panel):
    """409, so nothing is lost by surprise."""
    prop = make_property()
    make_panel(property_id=prop["id"])
    assert api.delete(f"/api/properties/{prop['id']}").status_code == 409


def test_an_unknown_property_is_404(api):
    assert api.get("/api/properties/999999").status_code == 404


def test_a_property_needs_a_name_and_an_address(api):
    assert api.post("/api/properties", json={"name": "Uten adresse"}).status_code == 422


# --- Panels ---------------------------------------------------------------

def test_create_a_panel_under_a_property(api, make_property):
    prop = make_property()
    res = api.post(f"/api/properties/{prop['id']}/panels", json={
        "name": "Hovedtavle", "location": "Gang", "rows": 2, "modules_per_row": 24,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["property_id"] == prop["id"]
    assert body["rows"] == 2
    assert body["modules_per_row"] == 24


def test_list_panels_for_a_property(api, make_property, make_panel):
    prop = make_property()
    panel = make_panel(property_id=prop["id"])
    res = api.get(f"/api/properties/{prop['id']}/panels")
    assert res.status_code == 200
    assert panel["id"] in [p["id"] for p in res.json()]


def test_panels_can_be_read_listed_updated_and_deleted(api, make_panel):
    panel = make_panel()

    assert api.get(f"/api/panels/{panel['id']}").status_code == 200
    assert panel["id"] in [p["id"] for p in api.get("/api/panels").json()]

    updated = api.put(f"/api/panels/{panel['id']}", json={"location": "Kjeller"})
    assert updated.status_code == 200
    assert updated.json()["location"] == "Kjeller"

    assert api.delete(f"/api/panels/{panel['id']}").status_code == 200


def test_a_panel_can_be_created_flat_as_well(api, make_property):
    """The flat route takes property_id in the body."""
    prop = make_property()
    res = api.post("/api/panels", json={
        "property_id": prop["id"], "name": "Underfordeling", "location": "Loft",
    })
    assert res.status_code == 200
    assert res.json()["property_id"] == prop["id"]


def test_a_panel_with_circuits_refuses_to_be_deleted(api, make_panel, make_circuit):
    panel = make_panel()
    make_circuit(panel_id=panel["id"])
    assert api.delete(f"/api/panels/{panel['id']}").status_code == 409


def test_a_panel_with_modules_is_deleted_along_with_them(api, make_panel, make_module):
    """Modules are panel layout, not standalone records.

    This returned 500 until recently: nothing declared the cascade, so the
    delete tried to orphan the modules and hit a NOT NULL constraint. A
    panel with modules in it is the normal case.
    """
    panel = make_panel()
    make_module(panel_id=panel["id"])
    assert api.delete(f"/api/panels/{panel['id']}").status_code == 200
    assert api.get(f"/api/panels/{panel['id']}").status_code == 404


# --- Modules --------------------------------------------------------------

def test_place_a_module_in_a_panel(api, make_panel):
    panel = make_panel()
    res = api.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 4, "width": 2, "type": "breaker",
        "label": "B02", "ampere": 16,
    })
    assert res.status_code == 200
    body = res.json()
    assert (body["row"], body["position"], body["width"]) == (0, 4, 2)


def test_list_modules_in_a_panel(api, make_panel, make_module):
    panel = make_panel()
    module = make_module(panel_id=panel["id"])
    res = api.get(f"/api/panels/{panel['id']}/modules")
    assert res.status_code == 200
    assert module["id"] in [m["id"] for m in res.json()]


def test_a_module_can_be_moved(api, make_module):
    module = make_module()
    res = api.put(f"/api/modules/{module['id']}", json={"position": 10})
    assert res.status_code == 200
    assert res.json()["position"] == 10


def test_a_module_cannot_be_moved_onto_another(api, make_panel, make_module):
    """409 — the panel view relies on this to refuse the drop."""
    panel = make_panel()
    make_module(panel_id=panel["id"], row=0, position=0, width=2)
    mover = make_module(panel_id=panel["id"], row=0, position=8, width=2)

    res = api.put(f"/api/modules/{mover['id']}", json={"position": 0})
    assert res.status_code == 409

    unchanged = api.get(f"/api/panels/{panel['id']}/modules").json()
    assert [m for m in unchanged if m["id"] == mover["id"]][0]["position"] == 8


def test_a_module_cannot_overlap_on_creation(api, make_panel, make_module):
    panel = make_panel()
    make_module(panel_id=panel["id"], row=0, position=0, width=2)
    res = api.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 1, "width": 2, "type": "breaker",
    })
    assert res.status_code == 409


def test_a_module_cannot_hang_off_the_end_of_the_rail(api, make_panel):
    panel = make_panel(modules_per_row=12)
    res = api.put_or_post = api.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 11, "width": 4, "type": "breaker",
    })
    assert res.status_code in (400, 422)


def test_a_module_can_be_deleted(api, make_module):
    module = make_module()
    assert api.delete(f"/api/modules/{module['id']}").status_code == 200
