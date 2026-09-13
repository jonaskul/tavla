"""The authentication seam.

No login exists yet, so these drive the seam directly: they swap in an
authenticator that returns whoever the test wants to be, and check that
everything downstream follows. When real login arrives it becomes one more
implementation of the same function, and these tests should keep passing
unchanged.

What they are really guarding is that the system fails *closed*. Every way
of not being a member of an organization — no principal, no membership, a
header naming someone else's organization — has to end in seeing nothing.
An authorization bug that fails open is how one customer reads another's
documentation.
"""

import pytest
from sqlmodel import Session, select

from auth import Principal, set_authenticator, single_user_authenticator
from models import Membership, Organization, Property, Role, User
from tenancy import ORG_HEADER, bind_organization


@pytest.fixture
def as_nobody():
    """Nobody is signed in."""
    set_authenticator(lambda request, session: None)
    yield
    set_authenticator(single_user_authenticator)


@pytest.fixture
def authenticate_as():
    """Sign in as a chosen user for the duration of a test."""
    def use(principal: Principal):
        set_authenticator(lambda request, session: principal)

    yield use
    set_authenticator(single_user_authenticator)


def _make_user_in_new_org(db_engine, email: str, org_name: str):
    """A second tenant with its own user, created below the API."""
    with Session(db_engine) as session:
        org = Organization(name=org_name)
        session.add(org)
        session.commit()
        session.refresh(org)

        user = User(email=email)
        session.add(user)
        session.commit()
        session.refresh(user)

        session.add(
            Membership(user_id=user.id, organization_id=org.id, role=Role.owner)
        )
        session.commit()
        return Principal(user_id=user.id, email=email), org.id


def test_without_a_principal_nothing_is_reachable(client, as_nobody):
    """Fail closed: not signed in means 401, not somebody else's data."""
    assert client.get("/api/properties").status_code == 401
    assert client.post(
        "/api/properties", json={"name": "X", "address": "Y"}
    ).status_code == 401


def test_a_user_without_a_membership_sees_nothing(client, db_engine, authenticate_as):
    """Authenticated is not the same as authorized."""
    with Session(db_engine) as session:
        user = User(email="utenfor@example.com")
        session.add(user)
        session.commit()
        session.refresh(user)
        stray = Principal(user_id=user.id, email=user.email)

    authenticate_as(stray)
    assert client.get("/api/properties").status_code == 401


def test_each_user_sees_only_their_own_organization(client, db_engine, authenticate_as):
    """The whole point, driven end to end through the API."""
    mine = client.post(
        "/api/properties", json={"name": "Mitt anlegg", "address": "Minveien 1"}
    ).json()

    theirs_principal, _ = _make_user_in_new_org(db_engine, "dem@example.com", "Andre firma")

    authenticate_as(theirs_principal)
    listing = client.get("/api/properties").json()
    assert [p["id"] for p in listing] == [], "another tenant's property was visible"

    created = client.post(
        "/api/properties", json={"name": "Deres anlegg", "address": "Deresveien 2"}
    ).json()

    # And they cannot reach mine by id.
    assert client.get(f"/api/properties/{mine['id']}").status_code == 404

    # Back to the original user: they see theirs and not the newcomer's.
    set_authenticator(single_user_authenticator)
    ids = [p["id"] for p in client.get("/api/properties").json()]
    assert mine["id"] in ids
    assert created["id"] not in ids


def test_the_org_header_picks_between_memberships(client, db_engine, authenticate_as):
    """A person can belong to several organizations; the header says which."""
    with Session(db_engine) as session:
        user = session.exec(select(User).order_by(User.id)).first()
        first_org = session.exec(
            select(Membership).where(Membership.user_id == user.id)
        ).first().organization_id

        second = Organization(name="Eget hus")
        session.add(second)
        session.commit()
        session.refresh(second)
        session.add(
            Membership(user_id=user.id, organization_id=second.id, role=Role.owner)
        )
        session.commit()
        second_org = second.id
        principal = Principal(user_id=user.id, email=user.email)

    authenticate_as(principal)

    in_first = client.post(
        "/api/properties",
        json={"name": "Jobbanlegg", "address": "Jobbveien 1"},
        headers={ORG_HEADER: str(first_org)},
    ).json()
    in_second = client.post(
        "/api/properties",
        json={"name": "Hjemme", "address": "Hjemveien 2"},
        headers={ORG_HEADER: str(second_org)},
    ).json()

    first_ids = [
        p["id"] for p in client.get(
            "/api/properties", headers={ORG_HEADER: str(first_org)}
        ).json()
    ]
    second_ids = [
        p["id"] for p in client.get(
            "/api/properties", headers={ORG_HEADER: str(second_org)}
        ).json()
    ]

    assert in_first["id"] in first_ids and in_first["id"] not in second_ids
    assert in_second["id"] in second_ids and in_second["id"] not in first_ids


def test_a_header_naming_someone_elses_organization_is_refused(
    client, db_engine, authenticate_as
):
    """Asking to act as an organization you do not belong to sees nothing."""
    mine = client.post(
        "/api/properties", json={"name": "Mitt", "address": "Minveien 1"}
    ).json()

    theirs_principal, theirs_org = _make_user_in_new_org(
        db_engine, "dem@example.com", "Andre firma"
    )
    authenticate_as(theirs_principal)

    res = client.get("/api/properties", headers={ORG_HEADER: str(theirs_org)})
    assert res.status_code == 200  # their own organization, fine

    with Session(db_engine) as session:
        user = session.exec(select(User).order_by(User.id)).first()
        my_org = session.exec(
            select(Membership).where(Membership.user_id == user.id)
        ).first().organization_id

    # Now claim mine.
    res = client.get("/api/properties", headers={ORG_HEADER: str(my_org)})
    assert res.status_code == 401, "claiming another organization must not succeed"
    assert client.get(
        f"/api/properties/{mine['id']}", headers={ORG_HEADER: str(my_org)}
    ).status_code == 401


def test_a_nonsense_header_is_refused_rather_than_ignored(client):
    """Garbage must not silently fall back to a default organization."""
    assert client.get(
        "/api/properties", headers={ORG_HEADER: "ikke-et-tall"}
    ).status_code == 401
    assert client.get(
        "/api/properties", headers={ORG_HEADER: "999999"}
    ).status_code == 401


def test_rows_are_stamped_with_the_acting_organization_not_the_default(
    client, db_engine, authenticate_as
):
    """The flush listener must follow the principal, not the first organization."""
    theirs_principal, theirs_org = _make_user_in_new_org(
        db_engine, "dem@example.com", "Andre firma"
    )
    authenticate_as(theirs_principal)

    created = client.post(
        "/api/properties", json={"name": "Deres", "address": "Deresveien 2"}
    ).json()

    with Session(db_engine) as session:
        bind_organization(session, theirs_org)
        prop = session.get(Property, created["id"])
        assert prop.organization_id == theirs_org


def test_the_system_endpoints_are_no_longer_public(client, as_nobody):
    """They shell out to git, pip and systemctl, and the service runs as root.

    Only the read-only ones are exercised here on purpose: if the guard ever
    regressed, a test that called /update/stream would actually pull and
    install. The allowlist is not prefix-based, so covering one path covers
    the mechanism.
    """
    assert client.get("/api/system/status").status_code == 401
    assert client.get("/api/system/pending").status_code == 401


def test_health_stays_public(client, as_nobody):
    """Something has to answer before anyone can sign in."""
    assert client.get("/api/health").status_code == 200
