"""Tenant isolation.

There is one organization and no auth today, so these tests drive the seam
directly: they bind a session to a second organization and check that the
two cannot see each other. When authentication lands it decides which
organization a request acts as, and these tests should keep passing
unchanged — that is the point of them.
"""

import pytest
from sqlmodel import Session, select

from models import Membership, Organization, Property, Role, User
from tenancy import bind_organization, ensure_default_organization


@pytest.fixture
def second_org(db_engine):
    """A second tenant, created directly rather than through the API."""
    with Session(db_engine) as session:
        org = Organization(name="Andre firma")
        session.add(org)
        session.commit()
        session.refresh(org)
        return org.id


def test_new_rows_are_stamped_with_the_acting_organization(client, db_engine):
    created = client.post(
        "/api/properties", json={"name": "Testbolig", "address": "Testveien 1"}
    ).json()

    with Session(db_engine) as session:
        prop = session.get(Property, created["id"])
        assert prop.organization_id is not None, "flush listener did not stamp the row"


def test_a_property_belonging_to_another_org_is_invisible(
    client, db_engine, second_org
):
    """The core guarantee: one tenant's data must not surface for another."""

    # A property owned by the other tenant, inserted below the API.
    with Session(db_engine) as session:
        bind_organization(session, second_org)
        other = Property(
            organization_id=second_org, name="Annen bolig", address="Annenveien 2"
        )
        session.add(other)
        session.commit()
        session.refresh(other)
        other_id = other.id

    mine = client.post(
        "/api/properties", json={"name": "Min bolig", "address": "Minveien 1"}
    ).json()

    listing = client.get("/api/properties").json()
    ids = [p["id"] for p in listing]
    assert mine["id"] in ids
    assert other_id not in ids, "another tenant's property appeared in the listing"

    # Addressing it directly must not reveal that it exists.
    assert client.get(f"/api/properties/{other_id}").status_code == 404
    assert client.get(f"/api/properties/{other_id}/panels").status_code == 404
    assert client.delete(f"/api/properties/{other_id}").status_code == 404
    assert client.put(
        f"/api/properties/{other_id}", json={"name": "Kapret"}
    ).status_code == 404

    # And it is still intact afterwards.
    with Session(db_engine) as session:
        assert session.get(Property, other_id).name == "Annen bolig"


def test_custom_module_types_do_not_leak_between_orgs(client, db_engine):
    """Custom types were globally unique and globally visible before tenancy."""
    from models import ModuleTypeDefinition

    with Session(db_engine) as session:
        org = Organization(name="Andre firma")
        session.add(org)
        session.commit()
        session.refresh(org)
        session.add(
            ModuleTypeDefinition(
                organization_id=org.id,
                key="deres_type",
                name_no="Deres type",
                color="#123456",
                abbreviation="DT",
            )
        )
        session.commit()

    keys = [t["key"] for t in client.get("/api/module_types").json()]
    assert "deres_type" not in keys, "another tenant's custom type was visible"

    # The same key is therefore still free for us.
    res = client.post(
        "/api/module_types",
        json={
            "key": "deres_type",
            "name_no": "Vår type",
            "color": "#654321",
            "abbreviation": "VT",
            "can_have_circuit": False,
            "can_have_ampere": False,
        },
    )
    assert res.status_code == 200, res.text


def test_membership_links_a_user_to_an_organization(db_engine):
    """The shape auth will plug into: provider owns identity, we own membership."""
    with Session(db_engine) as session:
        org = ensure_default_organization(session)
        user = User(external_auth_id="provider|abc123", email="ola@example.com", name="Ola")
        session.add(user)
        session.commit()
        session.refresh(user)

        session.add(Membership(user_id=user.id, organization_id=org.id, role=Role.owner))
        session.commit()

        found = session.exec(
            select(Membership).where(Membership.user_id == user.id)
        ).all()
        assert len(found) == 1
        assert found[0].organization_id == org.id
        assert found[0].role == Role.owner
        # No password anywhere: the provider owns authentication.
        assert not hasattr(user, "password_hash")
