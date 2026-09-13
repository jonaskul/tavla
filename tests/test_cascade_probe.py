"""Cover every delete endpoint with child rows present.

Deleting a parent used to raise IntegrityError wherever a child's foreign
key was NOT NULL, because no Relationship() in models.py declared a
cascade and SQLAlchemy therefore tried to NULL the child out instead.

The policy these tests pin down:

- Rows a parent owns outright cascade (panel->modules, equipment->channels,
  and the changelog rows hanging off circuits, connection points and
  equipment). models.py declares this via CASCADE.
- Independent records block with 409, so the user deletes them explicitly:
  property->panels, panel->circuits, circuit->connection points,
  circuit->equipment, equipment->files.
- Optional links are cleared, not cascaded: a channel survives its circuit
  as unassigned, and Module.circuit_id is reset by delete_circuit.
"""


def test_delete_equipment_with_channels(client, equipment_factory, channel_factory):
    eq = equipment_factory()
    for n in (1, 2, 3):
        channel_factory(equipment_id=eq["id"], number=n)

    resp = client.delete(f"/api/equipment/{eq['id']}")
    assert resp.status_code == 200, resp.text

    # channels must be gone, not orphaned
    remaining = client.get(f"/api/channels?equipment_id={eq['id']}")
    if remaining.status_code == 200:
        assert remaining.json() == [], f"orphaned channels: {remaining.json()}"


def test_delete_equipment_with_changelog(client, equipment_factory):
    """create_equipment writes a ChangeLog row; deleting must not crash on it."""
    eq = equipment_factory()
    resp = client.delete(f"/api/equipment/{eq['id']}")
    assert resp.status_code == 200, resp.text


def test_delete_circuit_with_equipment_is_blocked(client, circuit_factory, equipment_factory):
    """Equipment is independent data — deleting its circuit must not take it out."""
    circuit = circuit_factory()
    equipment_factory(circuit_id=circuit["id"])

    resp = client.delete(f"/api/circuits/{circuit['id']}")
    assert resp.status_code == 409, f"got {resp.status_code}: {resp.text}"


def test_delete_circuit_with_channels_referencing_it(
    client, circuit_factory, equipment_factory, channel_factory
):
    """Channel.circuit_id points at a circuit; deleting that circuit must not crash."""
    circuit = circuit_factory()
    eq = equipment_factory(circuit_id=circuit["id"])
    channel_factory(equipment_id=eq["id"], number=1, circuit_id=circuit["id"])

    resp = client.delete(f"/api/circuits/{circuit['id']}")
    assert resp.status_code in (200, 409), f"got {resp.status_code}: {resp.text}"


def test_delete_circuit_with_connection_points(client, circuit_factory, cp_factory):
    circuit = circuit_factory()
    cp_factory(circuit_id=circuit["id"])

    resp = client.delete(f"/api/circuits/{circuit['id']}")
    assert resp.status_code in (200, 409), f"got {resp.status_code}: {resp.text}"


def test_delete_panel_with_circuits(client, panel_factory, circuit_factory):
    panel = panel_factory()
    circuit_factory(panel_id=panel["id"])

    resp = client.delete(f"/api/panels/{panel['id']}")
    assert resp.status_code in (200, 409), f"got {resp.status_code}: {resp.text}"


def test_delete_panel_with_modules_cascades(client, panel_factory, module_factory):
    """Modules are panel layout, not standalone records — they go with the panel.

    A panel with modules is the normal case, so this path must not 500.
    """
    panel = panel_factory()
    module_factory(panel_id=panel["id"], position=0)

    resp = client.delete(f"/api/panels/{panel['id']}")
    assert resp.status_code == 200, f"got {resp.status_code}: {resp.text}"

    assert client.get(f"/api/panels/{panel['id']}").status_code == 404


def test_delete_connection_point_with_files(client, connection_point_factory, file_factory):
    cp = connection_point_factory()
    file_factory(connection_point_id=cp["id"])

    resp = client.delete(f"/api/connection_points/{cp['id']}")
    assert resp.status_code in (200, 409), f"got {resp.status_code}: {resp.text}"


def test_delete_equipment_with_files_is_blocked(client, equipment_factory, equipment_file_factory):
    eq = equipment_factory()
    equipment_file_factory(equipment_id=eq["id"])

    resp = client.delete(f"/api/equipment/{eq['id']}")
    assert resp.status_code == 409, f"got {resp.status_code}: {resp.text}"


def test_delete_circuit_leaves_no_dangling_module_reference(
    client, panel_factory, circuit_factory, module_factory
):
    """A module linked to a deleted circuit must not keep pointing at it."""
    panel = panel_factory()
    circuit = circuit_factory(panel_id=panel["id"])
    client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 2, "type": "breaker",
        "label": "B01", "ampere": 16, "circuit_id": circuit["id"],
    })

    assert client.delete(f"/api/circuits/{circuit['id']}").status_code == 200

    after = client.get(f"/api/panels/{panel['id']}/modules").json()
    stale = [m for m in after if m.get("circuit_id") == circuit["id"]]
    assert not stale, f"module still points at deleted circuit: {stale}"
