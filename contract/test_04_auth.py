"""Innloggingsendepunktene.

These cover the contract without completing a sign-in, because reading the
one-time code out of an inbox is implementation-specific and this suite has
to run unchanged against both backends. The full flow — code issued, code
entered, session established — stays in the backend's own tests, where the
code can be reached.

What is contract, and is checked here: the shapes, the status codes, and
that requesting a code gives away nothing about whether the address is
known.
"""


def test_requesting_a_code_accepts_an_address(api, unique):
    res = api.post("/api/auth/request-code", json={"email": f"kontrakt-{unique}@example.com"})
    assert res.status_code == 200
    assert res.json().get("ok") is True


def test_the_reply_is_the_same_for_an_unknown_address(api, unique):
    """Otherwise the endpoint is a way to find out who the customers are.

    Both calls use fresh addresses so neither is throttled; a throttled
    reply is also identical by design, but that is a separate property and
    is covered in the backend's own tests.
    """
    first = api.post("/api/auth/request-code", json={"email": f"a-{unique}@example.com"})
    second = api.post("/api/auth/request-code", json={"email": f"b-{unique}@example.com"})

    assert first.status_code == second.status_code == 200
    assert first.text == second.text


def test_a_malformed_address_is_refused(api):
    assert api.post("/api/auth/request-code", json={"email": "ikke-en-adresse"}).status_code == 422
    assert api.post("/api/auth/request-code", json={}).status_code == 422


def test_a_wrong_code_is_refused(api, unique):
    email = f"feilkode-{unique}@example.com"
    api.post("/api/auth/request-code", json={"email": email})

    res = api.post("/api/auth/verify", json={"email": email, "code": "000000"})
    assert res.status_code == 400


def test_verifying_without_a_code_outstanding_is_refused(api, unique):
    res = api.post("/api/auth/verify", json={
        "email": f"ingen-kode-{unique}@example.com", "code": "123456",
    })
    assert res.status_code == 400


def test_verify_requires_both_fields(api):
    assert api.post("/api/auth/verify", json={"email": "a@example.com"}).status_code == 422


def test_signing_out_is_idempotent(api):
    """It has to answer the same whether or not there was a session, so a
    client can always call it without checking first."""
    assert api.post("/api/auth/logout").status_code == 200
    assert api.post("/api/auth/logout").status_code == 200
