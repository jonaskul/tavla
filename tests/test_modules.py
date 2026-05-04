def test_create_module(client, panel_factory):
    panel = panel_factory()
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0,
        "position": 0,
        "width": 2,
        "type": "breaker",
        "ampere": 16,
        "label": "B01",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["width"] == 2
    assert data["type"] == "breaker"


def test_module_overlap_blocked(client, panel_factory):
    panel = panel_factory()
    client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 2, "type": "breaker", "label": "B01",
    })
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 1, "width": 1, "type": "rcd", "label": "JF",
    })
    assert res.status_code == 409


def test_module_outside_panel_width_blocked(client, panel_factory):
    panel = panel_factory()  # 12 moduler per skinne
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 11, "width": 2, "type": "breaker", "label": "B01",
    })
    assert res.status_code == 400


def test_module_wrong_row_blocked(client, panel_factory):
    panel = panel_factory()  # 1 rad
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 5, "position": 0, "width": 1, "type": "breaker", "label": "B01",
    })
    assert res.status_code == 400


def test_update_module(client, module_factory):
    module = module_factory()
    res = client.put(f"/api/modules/{module['id']}", json={
        **module, "ampere": 20, "label": "B01-oppdatert",
    })
    assert res.status_code == 200
    assert res.json()["ampere"] == 20


def test_delete_module(client, module_factory):
    module = module_factory()
    res = client.delete(f"/api/modules/{module['id']}")
    assert res.status_code == 200
    panel_modules = client.get(f"/api/panels/{module['panel_id']}/modules").json()
    assert not any(m["id"] == module["id"] for m in panel_modules)


def test_get_modules_for_panel(client, panel_factory, module_factory):
    panel = panel_factory()
    module_factory(panel_id=panel["id"], position=0)
    module_factory(panel_id=panel["id"], position=2)
    res = client.get(f"/api/panels/{panel['id']}/modules")
    assert res.status_code == 200
    assert len(res.json()) == 2
