"""Filer, modultyper, endringslogg og eksport/import."""

import io

JPEG = b"\xff\xd8\xff" + b"innhold"
PNG = b"\x89PNG\r\n\x1a\n" + b"piksler"
PDF = b"%PDF-1.7\n" + b"sider"


# --- Files ----------------------------------------------------------------

def test_upload_read_and_delete_a_file(api, make_connection_point):
    cp = make_connection_point()
    created = api.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("skap.jpg", io.BytesIO(JPEG), "image/jpeg")},
    )
    assert created.status_code == 200
    record = created.json()
    assert record["filename"] == "skap.jpg"
    assert record["mimetype"] == "image/jpeg"
    assert record["connection_point_id"] == cp["id"]

    assert api.get(f"/api/files/{record['id']}").status_code == 200

    content = api.get(f"/api/files/{record['id']}/content")
    assert content.status_code == 200
    assert content.content == JPEG

    assert api.delete(f"/api/files/{record['id']}").status_code == 200
    assert api.get(f"/api/files/{record['id']}/content").status_code == 404


def test_upload_against_equipment(api, make_equipment):
    eq = make_equipment()
    res = api.post(
        f"/api/equipment/{eq['id']}/files",
        files={"file": ("datablad.pdf", io.BytesIO(PDF), "application/pdf")},
    )
    assert res.status_code == 200
    assert res.json()["equipment_id"] == eq["id"]
    assert res.json()["mimetype"] == "application/pdf"


def test_the_flat_upload_routes(api, make_connection_point):
    """Two shapes exist: the id as a query parameter, and as a form field."""
    cp = make_connection_point()

    legacy = api.post(
        f"/api/files/upload?connection_point_id={cp['id']}",
        files={"file": ("a.png", io.BytesIO(PNG), "image/png")},
    )
    assert legacy.status_code == 200

    form = api.post(
        "/api/files",
        data={"connection_point_id": str(cp["id"])},
        files={"file": ("b.png", io.BytesIO(PNG), "image/png")},
    )
    assert form.status_code == 200


def test_files_are_listed_and_filtered(api, make_connection_point, upload):
    cp = make_connection_point()
    file = upload(connection_point_id=cp["id"])

    per_cp = api.get(f"/api/connection_points/{cp['id']}/files")
    assert file["id"] in [f["id"] for f in per_cp.json()]

    listed = api.get("/api/files", params={"connection_point_id": cp["id"]})
    assert listed.status_code == 200
    assert file["id"] in [f["id"] for f in listed.json()]


def test_files_are_listed_per_equipment(api, make_equipment, upload):
    eq = make_equipment()
    file = upload(equipment_id=eq["id"])

    per_equipment = api.get(f"/api/equipment/{eq['id']}/files")
    assert per_equipment.status_code == 200
    assert file["id"] in [f["id"] for f in per_equipment.json()]

    listed = api.get("/api/files", params={"equipment_id": eq["id"]})
    assert listed.status_code == 200
    assert file["id"] in [f["id"] for f in listed.json()]


def test_the_bytes_decide_the_type_not_the_header(api, make_connection_point):
    """A PDF claiming to be a JPEG is stored as a PDF."""
    cp = make_connection_point()
    res = api.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("lureri.jpg", io.BytesIO(PDF), "image/jpeg")},
    )
    assert res.status_code == 200
    assert res.json()["mimetype"] == "application/pdf"


def test_an_unsupported_type_is_refused(api, make_connection_point):
    cp = make_connection_point()
    res = api.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("side.html", io.BytesIO(b"<html>hei</html>"), "text/html")},
    )
    assert res.status_code == 400


def test_the_storage_location_is_not_exposed(api, make_connection_point, upload):
    """Handing out the key invites someone to try the bucket directly."""
    cp = make_connection_point()
    record = upload(connection_point_id=cp["id"])
    assert "storage_key" not in record
    assert "local_path" not in record


# --- Module types ---------------------------------------------------------

def test_the_builtin_types_are_present(api):
    res = api.get("/api/module_types")
    assert res.status_code == 200
    keys = {t["key"] for t in res.json()}
    assert {"breaker", "rcd", "main_switch"} <= keys
    assert all(t["is_builtin"] for t in res.json() if t["key"] == "breaker")


def test_create_read_update_and_delete_a_custom_type(api, unique):
    created = api.post("/api/module_types", json={
        "key": f"kontrakt_{unique}", "name_no": "Kontrakttype", "color": "#123456",
        "abbreviation": "KT", "can_have_circuit": True, "can_have_ampere": False,
    })
    assert created.status_code == 200
    kind = created.json()
    assert kind["is_builtin"] is False

    assert api.get(f"/api/module_types/{kind['id']}").status_code == 200

    updated = api.put(f"/api/module_types/{kind['id']}", json={"color": "#654321"})
    assert updated.status_code == 200
    assert updated.json()["color"] == "#654321"

    assert api.delete(f"/api/module_types/{kind['id']}").status_code == 200


def test_a_key_cannot_be_reused(api, unique):
    key = f"dobbel_{unique}"
    first = api.post("/api/module_types", json={
        "key": key, "name_no": "Første", "color": "#000000", "abbreviation": "D1",
    })
    assert first.status_code == 200
    res = api.post("/api/module_types", json={
        "key": key, "name_no": "Andre", "color": "#111111", "abbreviation": "D2",
    })
    assert res.status_code == 400


def test_a_builtin_cannot_be_deleted(api):
    """It is shared by every tenant, so it is not one organization's to remove."""
    surge = next(t for t in api.get("/api/module_types").json()
                 if t["key"] == "surge_protection")
    assert api.delete(f"/api/module_types/{surge['id']}").status_code == 409


def test_editing_a_builtin_copies_it_rather_than_changing_it_for_everyone(api):
    """Built-ins are shared by every tenant, so editing one in place would
    change it for all of them.

    The copy shadows the shared type by key, so the listing still shows one
    entry. Removing the copy reverts to the default — which is also how this
    test leaves the instance as it found it.
    """
    def builtin():
        return next(t for t in api.get("/api/module_types").json()
                    if t["key"] == "surge_protection")

    before = builtin()
    assert before["is_builtin"] is True

    res = api.put(f"/api/module_types/{before['id']}", json={"color": "#ff0000"})
    assert res.status_code == 200
    override_id = res.json()["id"]

    listing = [t for t in api.get("/api/module_types").json()
               if t["key"] == "surge_protection"]
    assert len(listing) == 1, "kopien skal skygge for den delte, ikke komme i tillegg"
    assert listing[0]["color"] == "#ff0000"

    assert api.delete(f"/api/module_types/{override_id}").status_code == 200
    assert builtin()["color"] == before["color"]


def test_usage_count_for_a_type(api, make_panel):
    panel = make_panel()
    api.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 1, "position": 0, "width": 1, "type": "rcd",
    })
    res = api.get("/api/module_types/rcd/usage")
    assert res.status_code == 200
    assert res.json()["count"] >= 1


def test_a_type_in_use_cannot_be_deleted(api, make_panel, unique):
    key = f"i_bruk_{unique}"
    created = api.post("/api/module_types", json={
        "key": key, "name_no": "I bruk", "color": "#222222", "abbreviation": "IB",
    })
    assert created.status_code == 200, created.text

    panel = make_panel()
    api.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1, "type": key,
    })
    assert api.delete(f"/api/module_types/{created.json()['id']}").status_code == 409


# --- Changelog ------------------------------------------------------------

def test_a_changelog_entry_can_be_written_and_read(api, make_circuit):
    circuit = make_circuit()
    created = api.post("/api/changelog", json={
        "circuit_id": circuit["id"], "changed_by": "Ola",
        "description": "Byttet sikring til 16A",
    })
    assert created.status_code == 200
    entry = created.json()

    assert api.get(f"/api/changelog/{entry['id']}").status_code == 200

    per_circuit = api.get(f"/api/circuits/{circuit['id']}/changelog")
    assert per_circuit.status_code == 200
    assert entry["id"] in [e["id"] for e in per_circuit.json()]

    listed = api.get("/api/changelog", params={"circuit_id": circuit["id"]})
    assert listed.status_code == 200


def test_creating_a_connection_point_writes_to_the_log(api, make_circuit):
    """The log records work done, not only what someone typed into it."""
    circuit = make_circuit()
    api.post(f"/api/circuits/{circuit['id']}/connection_points", json={
        "type": "outlet", "location": "Stue sør",
    })
    entries = api.get(f"/api/circuits/{circuit['id']}/changelog").json()
    assert any("Koblingspunkt" in e["description"] for e in entries)


def test_changelog_for_a_connection_point(api, make_connection_point):
    cp = make_connection_point()
    res = api.get(f"/api/connection_points/{cp['id']}/changelog")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


# --- Export and import ----------------------------------------------------

def test_export_carries_the_whole_property(api, make_property, make_panel, make_circuit):
    prop = make_property(owner_name="Ola Nordmann", owner_email="ola@example.com")
    panel = make_panel(property_id=prop["id"])
    make_circuit(panel_id=panel["id"])
    api.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 2, "type": "breaker", "ampere": 16,
    })

    res = api.get(f"/api/export/{prop['id']}")
    assert res.status_code == 200
    body = res.json()
    assert body["owner_name"] == "Ola Nordmann"
    assert body["format_version"] >= 2
    assert len(body["panels"]) == 1
    # Format 1 omitted these entirely, which made a round trip lose the
    # whole panel layout.
    assert len(body["panels"][0]["modules"]) == 1
    assert len(body["panels"][0]["circuits"]) == 1


def test_import_recreates_a_property(api, make_property, make_panel, make_circuit):
    prop = make_property()
    panel = make_panel(property_id=prop["id"])
    circuit = make_circuit(panel_id=panel["id"])
    api.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 2, "type": "breaker",
        "circuit_id": circuit["id"],
    })

    original = api.get(f"/api/export/{prop['id']}").json()

    imported = api.post("/api/export", json=original)
    assert imported.status_code == 200
    new_id = imported.json()["id"]
    assert new_id != prop["id"], "import skal opprette, ikke overskrive"

    round_tripped = api.get(f"/api/export/{new_id}").json()

    def comparable(export):
        designation = {c["id"]: c["designation"]
                       for p in export["panels"] for c in p["circuits"]}

        def clean(node):
            if isinstance(node, dict):
                out = {}
                for key, value in node.items():
                    if key in ("id", "created_at"):
                        continue
                    if key == "circuit_id":
                        out[key] = designation.get(value) if value is not None else None
                    else:
                        out[key] = clean(value)
                return out
            if isinstance(node, list):
                return [clean(v) for v in node]
            return node

        return clean(export)

    assert comparable(round_tripped) == comparable(original)


def test_import_refuses_a_newer_format(api):
    res = api.post("/api/export", json={
        "format_version": 99, "name": "Fra framtiden", "address": "X", "panels": [],
    })
    assert res.status_code == 422


def test_import_refuses_a_malformed_file(api):
    assert api.post("/api/export", json={"name": "Mangler adresse"}).status_code == 422
