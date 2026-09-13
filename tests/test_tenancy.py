"""Tenant isolation.

There is one organization and no auth today, so these tests drive the seam
directly: they act as a second organization and check that the two cannot
see each other. When authentication lands it decides which organization a
request acts as, and these tests should keep passing unchanged — that is
the point of them.

Note how every direct database read below says which organization it acts
as. On PostgreSQL that is not decoration: row-level security returns no
rows at all to a session that has not declared one, so an unbound read
sees an empty database rather than everything. Failing closed like that is
the property worth having.
"""

from contextlib import contextmanager

import pytest
from sqlmodel import Session, select

from models import Membership, ModuleTypeDefinition, Organization, Property, Role, User
from tenancy import bind_organization, ensure_default_organization

from .conftest import TEST_DATABASE_URL


@contextmanager
def acting_as(engine, org_id):
    """A session bound to one organization, as a request would be."""
    with Session(engine) as session:
        bind_organization(session, org_id)
        yield session


@pytest.fixture
def default_org(db_engine):
    with Session(db_engine) as session:
        return ensure_default_organization(session).id


@pytest.fixture
def second_org(db_engine):
    """A second tenant, created directly rather than through the API."""
    with Session(db_engine) as session:
        org = Organization(name="Andre firma")
        session.add(org)
        session.commit()
        session.refresh(org)
        return org.id


def test_new_rows_are_stamped_with_the_acting_organization(client, db_engine, default_org):
    created = client.post(
        "/api/properties", json={"name": "Testbolig", "address": "Testveien 1"}
    ).json()

    with acting_as(db_engine, default_org) as session:
        prop = session.get(Property, created["id"])
        assert prop is not None
        assert prop.organization_id == default_org, "flush listener did not stamp the row"


def test_a_property_belonging_to_another_org_is_invisible(client, db_engine, second_org):
    """The core guarantee: one tenant's data must not surface for another."""
    with acting_as(db_engine, second_org) as session:
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

    ids = [p["id"] for p in client.get("/api/properties").json()]
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
    with acting_as(db_engine, second_org) as session:
        assert session.get(Property, other_id).name == "Annen bolig"


def test_custom_module_types_do_not_leak_between_orgs(client, db_engine, second_org):
    """Custom types were globally unique and globally visible before tenancy."""
    with acting_as(db_engine, second_org) as session:
        session.add(
            ModuleTypeDefinition(
                organization_id=second_org,
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


def test_membership_links_a_user_to_an_organization(db_engine, default_org):
    """The shape auth will plug into: provider owns identity, we own membership."""
    with acting_as(db_engine, default_org) as session:
        user = User(external_auth_id="provider|abc123", email="ola@example.com", name="Ola")
        session.add(user)
        session.commit()
        session.refresh(user)

        session.add(Membership(user_id=user.id, organization_id=default_org, role=Role.owner))
        session.commit()

        found = session.exec(
            select(Membership).where(Membership.user_id == user.id)
        ).all()
        assert len(found) == 1
        assert found[0].organization_id == default_org
        assert found[0].role == Role.owner
        # No password anywhere: the provider owns authentication.
        assert not hasattr(user, "password_hash")


# --- Row-level security ---------------------------------------------------
#
# These assert the guarantee the database itself makes, so they only mean
# something on PostgreSQL. SQLite has no RLS; there, isolation rests on the
# application scoping the tests above cover.

pg_only = pytest.mark.skipif(
    not TEST_DATABASE_URL, reason="row-level security requires PostgreSQL"
)


@pg_only
def test_unbound_session_sees_nothing(client, db_engine):
    """Failing closed: no declared organization means no rows, not all rows."""
    client.post("/api/properties", json={"name": "Bolig", "address": "Veien 1"})

    with Session(db_engine) as session:  # deliberately not bound
        assert session.exec(select(Property)).all() == []


@pg_only
def test_database_rejects_a_cross_tenant_write(db_engine, default_org, second_org):
    """Even a query that forgets its WHERE clause cannot write to another tenant."""
    from sqlalchemy.exc import ProgrammingError

    with acting_as(db_engine, default_org) as session:
        session.add(
            Property(organization_id=second_org, name="Kapret", address="Annenveien 2")
        )
        with pytest.raises(ProgrammingError, match="row-level security"):
            session.commit()


@pg_only
def test_database_hides_another_tenants_rows_from_a_raw_query(
    db_engine, default_org, second_org
):
    """The protection is on the table, not on the application's query."""
    with acting_as(db_engine, second_org) as session:
        session.add(Property(organization_id=second_org, name="Deres", address="B 2"))
        session.commit()

    # An unscoped SELECT — the mistake RLS exists to survive.
    with acting_as(db_engine, default_org) as session:
        assert [p.name for p in session.exec(select(Property)).all()] == []
