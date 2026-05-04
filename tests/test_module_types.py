"""Tests for ModuleTypeDefinition CRUD, seeding, usage count, and circuit blocking."""
import pytest


def test_builtin_types_seeded(client):
    res = client.get("/api/module_types")
    assert res.status_code == 200
    types = res.json()
    keys = [t["key"] for t in types]
    for expected in ["breaker", "rcd", "rcd_breaker", "shelly",
                     "dynalite", "surge_protection", "main_switch", "other"]:
        assert expected in keys


def test_builtin_types_seeded_only_once(client):
    # Call three times — should not duplicate
    client.get("/api/module_types")
    client.get("/api/module_types")
    res = client.get("/api/module_types")
    types = res.json()
    keys = [t["key"] for t in types]
    assert len(keys) == len(set(keys))


def test_builtin_types_sorted_first(client):
    res = client.get("/api/module_types")
    types = res.json()
    builtin_indices = [i for i, t in enumerate(types) if t["is_builtin"]]
    custom_indices = [i for i, t in enumerate(types) if not t["is_builtin"]]
    if custom_indices:
        assert max(builtin_indices) < min(custom_indices)


def test_create_custom_module_type(client):
    res = client.post("/api/module_types", json={
        "key": "my_custom",
        "name_no": "Min egendefinerte",
        "color": "#3b82f6",
        "abbreviation": "MC",
        "can_have_circuit": True,
        "can_have_ampere": True
    })
    assert res.status_code == 200
    data = res.json()
    assert data["key"] == "my_custom"
    assert data["is_builtin"] == False


def test_create_duplicate_key_blocked(client):
    client.post("/api/module_types", json={
        "key": "duplicate", "name_no": "Test",
        "color": "#000000", "abbreviation": "TS",
        "can_have_circuit": False, "can_have_ampere": False
    })
    res = client.post("/api/module_types", json={
        "key": "duplicate", "name_no": "Test 2",
        "color": "#ffffff", "abbreviation": "T2",
        "can_have_circuit": False, "can_have_ampere": False
    })
    assert res.status_code == 400


def test_abbreviation_max_3_chars(client):
    res = client.post("/api/module_types", json={
        "key": "toolong", "name_no": "For lang",
        "color": "#000000", "abbreviation": "ABCD",
        "can_have_circuit": False, "can_have_ampere": False
    })
    assert res.status_code == 422


def test_update_module_type(client):
    res = client.get("/api/module_types")
    breaker = next(t for t in res.json() if t["key"] == "breaker")
    res = client.put(f"/api/module_types/{breaker['id']}", json={
        **breaker, "name_no": "Oppdatert navn", "color": "#ff0000"
    })
    assert res.status_code == 200
    assert res.json()["name_no"] == "Oppdatert navn"
    assert res.json()["color"] == "#ff0000"


def test_update_key_blocked(client):
    res = client.get("/api/module_types")
    breaker = next(t for t in res.json() if t["key"] == "breaker")
    client.put(f"/api/module_types/{breaker['id']}", json={
        **breaker, "key": "new_key"
    })
    result = client.get(f"/api/module_types/{breaker['id']}").json()
    assert result["key"] == "breaker"


def test_delete_custom_type_not_in_use(client):
    create = client.post("/api/module_types", json={
        "key": "deleteme", "name_no": "Slett meg",
        "color": "#000000", "abbreviation": "DM",
        "can_have_circuit": False, "can_have_ampere": False
    })
    type_id = create.json()["id"]
    res = client.delete(f"/api/module_types/{type_id}")
    assert res.status_code == 200


def test_delete_type_in_use_blocked(client, panel_factory):
    create = client.post("/api/module_types", json={
        "key": "inuse", "name_no": "I bruk",
        "color": "#000000", "abbreviation": "IB",
        "can_have_circuit": False, "can_have_ampere": False
    })
    type_id = create.json()["id"]
    panel = panel_factory()
    client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1,
        "type": "inuse", "label": "Test"
    })
    res = client.delete(f"/api/module_types/{type_id}")
    assert res.status_code == 409


def test_delete_builtin_type_in_use_blocked(client, panel_factory):
    panel = panel_factory()
    client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1,
        "type": "breaker", "label": "B01", "ampere": 16
    })
    res = client.get("/api/module_types")
    breaker = next(t for t in res.json() if t["key"] == "breaker")
    res = client.delete(f"/api/module_types/{breaker['id']}")
    assert res.status_code == 409


def test_delete_builtin_type_not_in_use_allowed(client):
    res = client.get("/api/module_types")
    surge = next(t for t in res.json() if t["key"] == "surge_protection")
    res = client.delete(f"/api/module_types/{surge['id']}")
    assert res.status_code == 200


def test_usage_count_endpoint(client, panel_factory):
    panel = panel_factory()
    client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1,
        "type": "breaker", "label": "B01", "ampere": 16
    })
    res = client.get("/api/module_types/breaker/usage")
    assert res.status_code == 200
    assert res.json()["count"] >= 1


def test_usage_count_in_list(client, panel_factory):
    panel = panel_factory()
    client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1,
        "type": "rcd", "label": "JF01", "ampere": 25
    })
    res = client.get("/api/module_types")
    rcd = next(t for t in res.json() if t["key"] == "rcd")
    assert rcd["usage_count"] >= 1


def test_can_have_circuit_false_blocks_circuit(client, panel_factory, circuit_factory):
    client.post("/api/module_types", json={
        "key": "nocircuit", "name_no": "Ingen kurs",
        "color": "#000000", "abbreviation": "NK",
        "can_have_circuit": False, "can_have_ampere": False
    })
    panel = panel_factory()
    circuit = circuit_factory(panel_id=panel["id"])
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1,
        "type": "nocircuit", "circuit_id": circuit["id"]
    })
    assert res.status_code == 400


def test_can_have_circuit_true_allows_circuit(client, panel_factory, circuit_factory):
    panel = panel_factory()
    circuit = circuit_factory(panel_id=panel["id"])
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1,
        "type": "breaker", "label": "B01", "ampere": 16,
        "circuit_id": circuit["id"]
    })
    assert res.status_code == 200
    assert res.json()["circuit_id"] == circuit["id"]


def test_module_type_not_found(client):
    res = client.get("/api/module_types/99999")
    assert res.status_code == 404


def test_seed_idempotent_direct(client):
    """Calling seed_builtin_types twice must not produce duplicate rows."""
    from routers.module_types import seed_builtin_types
    from database import get_session
    # Get the overridden session from the test client
    session_gen = client.app.dependency_overrides.get(get_session)
    if session_gen:
        session = next(session_gen())
        seed_builtin_types(session)  # called once already in fixture; call again
        session.close()
    res = client.get("/api/module_types")
    keys = [t["key"] for t in res.json()]
    assert len(keys) == len(set(keys))
    assert len([k for k in keys if k == "breaker"]) == 1


def test_usage_count_accurate_before_delete_block(client, panel_factory):
    """Usage count in 409 detail matches actual module count."""
    client.post("/api/module_types", json={
        "key": "countme", "name_no": "Tell meg",
        "color": "#112233", "abbreviation": "CM",
        "can_have_circuit": False, "can_have_ampere": False
    })
    panel = panel_factory()
    for i in range(3):
        client.post(f"/api/panels/{panel['id']}/modules", json={
            "row": 0, "position": i, "width": 1, "type": "countme"
        })
    res = client.get("/api/module_types")
    t = next(x for x in res.json() if x["key"] == "countme")
    assert t["usage_count"] == 3
    del_res = client.delete(f"/api/module_types/{t['id']}")
    assert del_res.status_code == 409
    assert "3" in del_res.json()["detail"]
