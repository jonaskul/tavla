"""Export and import, which must be exact inverses.

The round-trip test is the real one: it builds a property with something
of every kind in it, exports, imports, exports again, and demands the two
exports match. Anything the export forgets to carry shows up as a
difference. That is how format 1 losing the entire panel layout would have
been caught.
"""

import pytest
from sqlmodel import Session, select

from models import Module, Property
from tenancy import bind_organization, ensure_default_organization


@pytest.fixture
def populated_property(client):
    """A property exercising every part of the model the export covers."""
    prop = client.post(
        "/api/properties",
        json={
            "name": "Testbolig",
            "address": "Testveien 1",
            "owner_name": "Ola Nordmann",
            "owner_email": "ola@example.com",
            "owner_phone": "99887766",
        },
    ).json()

    panel = client.post(
        f"/api/properties/{prop['id']}/panels",
        json={"name": "Hovedtavle", "location": "Gang", "rows": 2, "modules_per_row": 12,
              "notes": "Skapnotat"},
    ).json()

    circuit = client.post(
        f"/api/panels/{panel['id']}/circuits",
        json={"designation": "B01", "name": "Lys stue", "room": "Stue",
              "cable_type": "PFXP", "cross_section": 1.5, "conductor_count": 3,
              "length_m": 12.5, "notes": "Kursnotat"},
    ).json()
    other_circuit = client.post(
        f"/api/panels/{panel['id']}/circuits",
        json={"designation": "B02", "name": "Stikk kjøkken"},
    ).json()

    # A module bound to a circuit, a vacant one, and a wide one.
    client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 2, "type": "breaker",
        "label": "B01", "ampere": 16, "circuit_id": circuit["id"],
    })
    client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 2, "width": 1, "type": "other", "is_vacant": True,
    })
    client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 1, "position": 0, "width": 3, "type": "main_switch", "ampere": 50,
    })

    client.post(f"/api/circuits/{circuit['id']}/connection_points", json={
        "type": "outlet", "location": "Stue nord", "notes": "Punktnotat",
    })

    equipment = client.post(f"/api/circuits/{circuit['id']}/equipment", json={
        "type": "dynalite", "brand": "Philips", "model": "DDBC1200",
        "watt": 1200, "notes": "Utstyrsnotat",
    }).json()

    # A channel serving a *different* circuit than its equipment hangs off —
    # the case that cannot be inferred from nesting alone.
    client.post(f"/api/equipment/{equipment['id']}/channels", json={
        "number": 1, "label": "Kanal 1", "load": "Downlights",
        "watt": 300, "channel_type": "dimmer", "notes": "Kanalnotat",
        "circuit_id": other_circuit["id"],
    })
    client.post(f"/api/equipment/{equipment['id']}/channels", json={
        "number": 2, "label": "Kanal 2", "channel_type": "relay",
    })

    return prop


def _comparable(export: dict) -> dict:
    """Strip identity so two exports of equivalent data compare equal.

    Ids and timestamps necessarily differ between the original and the
    import. Circuit *references* differ too, and must: remapping them to
    the newly created circuits is the whole job. So they are resolved to
    the circuit's designation, which is stable, and a reference pointing at
    the wrong circuit still shows up as a difference.
    """
    designation_of = {
        c["id"]: c["designation"]
        for p in export["panels"]
        for c in p["circuits"]
    }

    def clean(node):
        if isinstance(node, dict):
            out = {}
            for key, value in node.items():
                if key in ("id", "created_at"):
                    continue
                if key == "circuit_id":
                    out[key] = designation_of.get(value) if value is not None else None
                else:
                    out[key] = clean(value)
            return out
        if isinstance(node, list):
            return [clean(v) for v in node]
        return node

    return clean(export)


def test_export_round_trip_loses_nothing(client, populated_property):
    """Export, import, export again — the two exports must agree."""
    original = client.get(f"/api/export/{populated_property['id']}").json()

    imported = client.post("/api/export", json=original)
    assert imported.status_code == 200, imported.text
    new_id = imported.json()["id"]
    assert new_id != populated_property["id"], "import must create, not overwrite"

    round_tripped = client.get(f"/api/export/{new_id}").json()

    assert _comparable(round_tripped) == _comparable(original)


def test_module_layout_survives_the_round_trip(client, populated_property, db_engine):
    """Format 1 dropped modules entirely; this is the regression guard."""
    original = client.get(f"/api/export/{populated_property['id']}").json()
    modules = original["panels"][0]["modules"]
    assert len(modules) == 3, "export must carry the panel layout"

    new_id = client.post("/api/export", json=original).json()["id"]
    new_export = client.get(f"/api/export/{new_id}").json()

    assert [
        (m["row"], m["position"], m["width"], m["type"], m["is_vacant"])
        for m in new_export["panels"][0]["modules"]
    ] == [
        (m["row"], m["position"], m["width"], m["type"], m["is_vacant"])
        for m in modules
    ]


def test_circuit_references_are_remapped_not_copied(client, populated_property, db_engine):
    """A module's circuit_id must point at the imported circuit, not the original."""
    original = client.get(f"/api/export/{populated_property['id']}").json()
    new_id = client.post("/api/export", json=original).json()["id"]
    new_export = client.get(f"/api/export/{new_id}").json()

    old_ids = {c["id"] for p in original["panels"] for c in p["circuits"]}
    new_ids = {c["id"] for p in new_export["panels"] for c in p["circuits"]}
    assert not (old_ids & new_ids), "fixture should produce distinct circuit ids"

    bound = [m for m in new_export["panels"][0]["modules"] if m["circuit_id"] is not None]
    assert bound, "the fixture has a module bound to a circuit"
    for m in bound:
        assert m["circuit_id"] in new_ids
        assert m["circuit_id"] not in old_ids

    # Same for the channel that serves a different circuit.
    channel = new_export["panels"][0]["circuits"][0]["equipment"][0]["channels"][0]
    assert channel["circuit_id"] in new_ids


def test_imported_rows_belong_to_the_importing_organization(
    client, populated_property, db_engine
):
    original = client.get(f"/api/export/{populated_property['id']}").json()
    new_id = client.post("/api/export", json=original).json()["id"]

    with Session(db_engine) as session:
        org_id = ensure_default_organization(session).id
        bind_organization(session, org_id)
        prop = session.get(Property, new_id)
        assert prop.organization_id == org_id
        modules = session.exec(select(Module)).all()
        assert modules, "modules were imported"
        assert all(m.organization_id == org_id for m in modules)


def test_import_rejects_a_newer_format(client):
    res = client.post("/api/export", json={
        "format_version": 99, "name": "Fra framtiden", "address": "X", "panels": [],
    })
    assert res.status_code == 422


def test_import_rejects_a_malformed_file(client):
    """A clear validation error, not an IntegrityError halfway through."""
    res = client.post("/api/export", json={"name": "Mangler adresse"})
    assert res.status_code == 422


def test_import_leaves_nothing_behind_when_it_fails(client, db_engine):
    """A partly imported installation is worse than none."""
    before = len(client.get("/api/properties").json())

    res = client.post("/api/export", json={
        "name": "Halvveis", "address": "Veien 1",
        "panels": [{
            "name": "Skap", "location": "Gang",
            # Second circuit is invalid: no designation.
            "circuits": [
                {"designation": "B01", "name": "Ok"},
                {"name": "Mangler betegnelse"},
            ],
        }],
    })
    assert res.status_code == 422

    assert len(client.get("/api/properties").json()) == before


def test_export_is_scoped_to_the_owning_organization(client, db_engine):
    """Another tenant's property must not be exportable."""
    from models import Organization

    with Session(db_engine) as session:
        org = Organization(name="Andre firma")
        session.add(org)
        session.commit()
        session.refresh(org)
        other_org = org.id

    with Session(db_engine) as session:
        bind_organization(session, other_org)
        theirs = Property(organization_id=other_org, name="Deres", address="B 2")
        session.add(theirs)
        session.commit()
        session.refresh(theirs)
        theirs_id = theirs.id

    assert client.get(f"/api/export/{theirs_id}").status_code == 404
