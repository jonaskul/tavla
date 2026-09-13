"""Signing in with one-time codes.

The mechanism is small; the care around it is the point. Each test below
pins one of the ways this goes wrong if written casually — enumeration,
flooding, guessing, replay, and sessions that outlive signing out.

The mailer is captured rather than sent, so nothing here touches the
network and the code is read the way the user would read it.
"""

import re
from datetime import timedelta

import pytest
from sqlmodel import Session, select

import mail
from auth import session_cookie_authenticator, set_authenticator, single_user_authenticator
from models import LoginCode, Membership, Organization, User, UserSession, utcnow
from routers.auth import MAX_ATTEMPTS, MAX_CODES_PER_EMAIL, SESSION_COOKIE


@pytest.fixture
def outbox():
    """Capture mail instead of sending it."""
    sent = []
    mail.set_mailer(lambda to, subject, text: sent.append((to, subject, text)))
    yield sent
    mail.set_mailer(mail.log_mailer)


@pytest.fixture
def login_client(client, monkeypatch):
    """A client where identity comes from the session cookie, as in production.

    COOKIE_SECURE is turned off because TestClient speaks http and would
    otherwise refuse to send a Secure cookie back — the flag is right, the
    transport here is not. A separate test covers the production default.
    """
    monkeypatch.setenv("COOKIE_SECURE", "0")
    set_authenticator(session_cookie_authenticator)
    yield client
    set_authenticator(single_user_authenticator)


def code_from(outbox) -> str:
    match = re.search(r"\b(\d{6})\b", outbox[-1][2])
    assert match, f"no code in mail body: {outbox[-1][2]}"
    return match.group(1)


def sign_in(client, outbox, email="ola@example.com"):
    assert client.post("/api/auth/request-code", json={"email": email}).status_code == 200
    res = client.post("/api/auth/verify", json={"email": email, "code": code_from(outbox)})
    assert res.status_code == 200, res.text
    return res


# --- The happy path -------------------------------------------------------

def test_signing_in_creates_an_account_and_an_organization(login_client, outbox, db_engine):
    """With passwordless login, signing in the first time is signing up."""
    res = sign_in(login_client, outbox)
    assert res.json()["email"] == "ola@example.com"

    with Session(db_engine) as session:
        user = session.exec(select(User).where(User.email == "ola@example.com")).first()
        assert user is not None
        membership = session.exec(
            select(Membership).where(Membership.user_id == user.id)
        ).first()
        assert membership is not None, "a new user needs an organization to work in"
        assert session.get(Organization, membership.organization_id) is not None


def test_a_signed_in_caller_can_use_the_app(login_client, outbox):
    assert login_client.get("/api/properties").status_code == 401

    sign_in(login_client, outbox)

    assert login_client.get("/api/properties").status_code == 200
    created = login_client.post(
        "/api/properties", json={"name": "Mitt anlegg", "address": "Veien 1"}
    )
    assert created.status_code == 200


def test_me_reports_the_user_and_their_organizations(login_client, outbox):
    sign_in(login_client, outbox)
    body = login_client.get("/api/auth/me").json()
    assert body["email"] == "ola@example.com"
    assert len(body["organizations"]) == 1
    assert body["organizations"][0]["role"] == "owner"


def test_signing_in_again_reuses_the_account(login_client, outbox, db_engine):
    sign_in(login_client, outbox)
    login_client.post("/api/auth/logout")
    sign_in(login_client, outbox)

    with Session(db_engine) as session:
        users = session.exec(select(User).where(User.email == "ola@example.com")).all()
        assert len(users) == 1
        memberships = session.exec(
            select(Membership).where(Membership.user_id == users[0].id)
        ).all()
        assert len(memberships) == 1, "a second sign-in must not add an organization"


# --- Not leaking who has an account ---------------------------------------

def test_requesting_a_code_answers_the_same_for_any_address(login_client, outbox):
    """Otherwise this endpoint tells anyone which addresses are customers."""
    known = login_client.post("/api/auth/request-code", json={"email": "ola@example.com"})
    sign_in(login_client, outbox)
    login_client.post("/api/auth/logout")

    existing = login_client.post("/api/auth/request-code", json={"email": "ola@example.com"})
    unknown = login_client.post("/api/auth/request-code", json={"email": "ingen@example.com"})

    assert known.status_code == existing.status_code == unknown.status_code == 200
    assert existing.json() == unknown.json()


def test_rate_limiting_answers_the_same_as_success(login_client, outbox):
    """A different reply when throttled would leak just as much."""
    replies = [
        login_client.post("/api/auth/request-code", json={"email": "spam@example.com"})
        for _ in range(MAX_CODES_PER_EMAIL + 2)
    ]
    assert {r.status_code for r in replies} == {200}
    assert len({r.text for r in replies}) == 1
    assert len(outbox) == MAX_CODES_PER_EMAIL, "throttled requests must not send mail"


# --- Guessing and replay --------------------------------------------------

def test_a_wrong_code_is_refused(login_client, outbox):
    login_client.post("/api/auth/request-code", json={"email": "ola@example.com"})
    res = login_client.post(
        "/api/auth/verify", json={"email": "ola@example.com", "code": "000000"}
    )
    assert res.status_code == 400
    assert login_client.get("/api/properties").status_code == 401


def test_a_code_dies_after_too_many_wrong_guesses(login_client, outbox):
    """Six digits is a million options — without a ceiling it is guessable."""
    login_client.post("/api/auth/request-code", json={"email": "ola@example.com"})
    real = code_from(outbox)

    for _ in range(MAX_ATTEMPTS):
        login_client.post(
            "/api/auth/verify", json={"email": "ola@example.com", "code": "000000"}
        )

    # Even the correct code no longer works.
    res = login_client.post(
        "/api/auth/verify", json={"email": "ola@example.com", "code": real}
    )
    assert res.status_code == 400


def test_a_code_works_only_once(login_client, outbox):
    login_client.post("/api/auth/request-code", json={"email": "ola@example.com"})
    code = code_from(outbox)

    assert login_client.post(
        "/api/auth/verify", json={"email": "ola@example.com", "code": code}
    ).status_code == 200
    assert login_client.post(
        "/api/auth/verify", json={"email": "ola@example.com", "code": code}
    ).status_code == 400


def test_an_expired_code_is_refused(login_client, outbox, db_engine):
    login_client.post("/api/auth/request-code", json={"email": "ola@example.com"})
    code = code_from(outbox)

    with Session(db_engine) as session:
        row = session.exec(select(LoginCode)).first()
        row.expires_at = utcnow() - timedelta(seconds=1)
        session.add(row)
        session.commit()

    assert login_client.post(
        "/api/auth/verify", json={"email": "ola@example.com", "code": code}
    ).status_code == 400


def test_a_code_is_not_valid_for_a_different_address(login_client, outbox):
    """The code is bound to the address it was sent to."""
    login_client.post("/api/auth/request-code", json={"email": "ola@example.com"})
    code = code_from(outbox)

    assert login_client.post(
        "/api/auth/verify", json={"email": "kari@example.com", "code": code}
    ).status_code == 400


def test_the_stored_code_is_not_the_code(login_client, outbox, db_engine):
    """A database dump must not yield working codes."""
    login_client.post("/api/auth/request-code", json={"email": "ola@example.com"})
    code = code_from(outbox)

    with Session(db_engine) as session:
        stored = session.exec(select(LoginCode)).first().code_hash

    assert code not in stored
    assert len(stored) == 64  # HMAC-SHA256, keyed by a secret outside the database


# --- Sessions -------------------------------------------------------------

def test_signing_out_takes_effect_immediately(login_client, outbox):
    """The reason for server-side sessions rather than a JWT."""
    sign_in(login_client, outbox)
    assert login_client.get("/api/properties").status_code == 200

    login_client.post("/api/auth/logout")
    assert login_client.get("/api/properties").status_code == 401


def test_a_revoked_session_stops_working_even_with_the_cookie(
    login_client, outbox, db_engine
):
    """Revoking server-side must be enough, without the client cooperating."""
    sign_in(login_client, outbox)

    with Session(db_engine) as session:
        row = session.exec(select(UserSession)).first()
        row.revoked_at = utcnow()
        session.add(row)
        session.commit()

    assert login_client.get("/api/properties").status_code == 401


def test_an_expired_session_stops_working(login_client, outbox, db_engine):
    sign_in(login_client, outbox)

    with Session(db_engine) as session:
        row = session.exec(select(UserSession)).first()
        row.expires_at = utcnow() - timedelta(seconds=1)
        session.add(row)
        session.commit()

    assert login_client.get("/api/properties").status_code == 401


def test_a_forged_cookie_is_refused(login_client):
    login_client.cookies.set(SESSION_COOKIE, "ikke-et-ekte-token")
    assert login_client.get("/api/properties").status_code == 401


def test_the_stored_session_token_is_not_the_cookie(login_client, outbox, db_engine):
    """A database dump must not be replayable as live sessions."""
    sign_in(login_client, outbox)
    cookie = login_client.cookies.get(SESSION_COOKIE)

    with Session(db_engine) as session:
        stored = session.exec(select(UserSession)).first().token_hash

    assert cookie and cookie not in stored


def test_the_session_cookie_carries_the_right_flags(login_client, outbox):
    """HttpOnly keeps XSS from lifting the session; SameSite blocks the CSRF case."""
    res = sign_in(login_client, outbox)
    set_cookie = res.headers["set-cookie"].lower()

    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie
    assert "path=/" in set_cookie


def test_the_cookie_is_secure_by_default(client, outbox, monkeypatch):
    """Only http transport in tests turns this off; production keeps it on."""
    monkeypatch.delenv("COOKIE_SECURE", raising=False)
    set_authenticator(session_cookie_authenticator)
    try:
        client.post("/api/auth/request-code", json={"email": "ola@example.com"})
        res = client.post(
            "/api/auth/verify",
            json={"email": "ola@example.com", "code": code_from(outbox)},
        )
        assert "secure" in res.headers["set-cookie"].lower()
    finally:
        set_authenticator(single_user_authenticator)


# --- Two people -----------------------------------------------------------

def test_two_users_get_separate_organizations(login_client, outbox):
    """The isolation the whole tenancy layer exists for, reached by signing in."""
    sign_in(login_client, outbox, "ola@example.com")
    ola_property = login_client.post(
        "/api/properties", json={"name": "Olas anlegg", "address": "Olaveien 1"}
    ).json()
    login_client.post("/api/auth/logout")

    sign_in(login_client, outbox, "kari@example.com")
    listing = login_client.get("/api/properties").json()
    assert [p["id"] for p in listing] == [], "Kari must not see Ola's property"
    assert login_client.get(f"/api/properties/{ola_property['id']}").status_code == 404
