"""The API contract, exercised over HTTP against a running Tavla.

Nothing here imports the application. That is the point: this suite has to
run unchanged against the FastAPI implementation and against the Workers
rewrite, and it is what gives "the rewrite is finished" a precise meaning.

    TAVLA_BASE_URL=http://127.0.0.1:8000 python -m pytest contract/

The suite is written against the implementation that provably works, and
only then pointed at the new one. The risk in a rewrite is that the new
code and the new tests are written from the same misunderstanding, so
neither catches it; tests written against something already verified
encode behaviour rather than assumptions.

Signing in: if the instance answers /api/auth/me without a cookie it is
running AUTH_MODE=single_user and the suite proceeds. Otherwise set
TAVLA_SESSION to a session cookie value.
"""

import json
import os
import pathlib
import re
import uuid
from typing import Dict, List, Set, Tuple

import httpx
import pytest

BASE_URL = os.getenv("TAVLA_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
SESSION_COOKIE_VALUE = os.getenv("TAVLA_SESSION")

INVENTORY = pathlib.Path(__file__).parent / "endpoints.json"

# Excluded from the contract on purpose. The system endpoints shell out to
# git and systemctl, which has no meaning on Workers and is deleted there.
EXCLUDED_PREFIXES = ("/api/system",)

# Requests the suite makes, recorded as (method, path template), so the
# coverage test can prove every endpoint was actually exercised rather than
# merely believed to be.
TOUCHED: Set[Tuple[str, str]] = set()


def load_contract() -> List[Dict[str, str]]:
    doc = json.loads(INVENTORY.read_text())
    return [
        e for e in doc["endpoints"]
        if not e["path"].startswith(EXCLUDED_PREFIXES)
    ]


def _templates() -> List[Tuple[str, str, re.Pattern]]:
    """Each endpoint with a regex that matches its concrete paths."""
    out = []
    for e in load_contract():
        pattern = "^" + re.sub(r"\{[^}]+\}", r"[^/]+", re.escape(e["path"]).replace(r"\{", "{").replace(r"\}", "}")) + "$"
        pattern = re.sub(r"\{[^}]+\}", r"[^/]+", pattern)
        out.append((e["method"], e["path"], re.compile(pattern)))
    # Longest first, so /api/properties/{id}/panels wins over
    # /api/properties/{id} for a path that matches both.
    out.sort(key=lambda t: -len(t[1]))
    return out


TEMPLATES = _templates()


def record(method: str, url: str) -> None:
    path = httpx.URL(url).path
    for tmpl_method, tmpl_path, pattern in TEMPLATES:
        if tmpl_method == method.upper() and pattern.match(path):
            TOUCHED.add((tmpl_method, tmpl_path))
            return


@pytest.fixture(scope="session")
def api() -> httpx.Client:
    """A signed-in client that records what it touches."""
    client = httpx.Client(
        base_url=BASE_URL,
        timeout=30,
        follow_redirects=True,
        event_hooks={
            "request": [lambda r: record(r.method, str(r.url))],
        },
    )

    if SESSION_COOKIE_VALUE:
        client.cookies.set("tavla_session", SESSION_COOKIE_VALUE)

    probe = client.get("/api/auth/me")
    if probe.status_code == 401:
        pytest.exit(
            "Ikke innlogget mot " + BASE_URL + ".\n"
            "Kjør instansen med AUTH_MODE=single_user, eller sett "
            "TAVLA_SESSION til en gyldig sesjonscookie.",
            returncode=2,
        )
    probe.raise_for_status()

    yield client
    client.close()


# --- Builders -------------------------------------------------------------
#
# Each returns a created resource. They go through the API rather than a
# database, because the database is exactly what the rewrite replaces.

@pytest.fixture
def make_property(api):
    def build(**over):
        body = {"name": "Kontraktbolig", "address": "Kontraktveien 1", **over}
        res = api.post("/api/properties", json=body)
        assert res.status_code == 200, res.text
        return res.json()
    return build


@pytest.fixture
def make_panel(api, make_property):
    def build(property_id=None, **over):
        if property_id is None:
            property_id = make_property()["id"]
        body = {"name": "Hovedtavle", "location": "Gang", "rows": 2,
                "modules_per_row": 24, **over}
        res = api.post(f"/api/properties/{property_id}/panels", json=body)
        assert res.status_code == 200, res.text
        return res.json()
    return build


@pytest.fixture
def make_circuit(api, make_panel):
    def build(panel_id=None, **over):
        if panel_id is None:
            panel_id = make_panel()["id"]
        body = {"designation": "B01", "name": "Lys stue", **over}
        res = api.post(f"/api/panels/{panel_id}/circuits", json=body)
        assert res.status_code == 200, res.text
        return res.json()
    return build


@pytest.fixture
def make_module(api, make_panel):
    def build(panel_id=None, **over):
        if panel_id is None:
            panel_id = make_panel()["id"]
        body = {"row": 0, "position": 0, "width": 2, "type": "breaker",
                "label": "B01", "ampere": 16, **over}
        res = api.post(f"/api/panels/{panel_id}/modules", json=body)
        assert res.status_code == 200, res.text
        return res.json()
    return build


@pytest.fixture
def make_connection_point(api, make_circuit):
    def build(circuit_id=None, **over):
        if circuit_id is None:
            circuit_id = make_circuit()["id"]
        body = {"type": "outlet", "location": "Stue nord", **over}
        res = api.post(f"/api/circuits/{circuit_id}/connection_points", json=body)
        assert res.status_code == 200, res.text
        return res.json()
    return build


@pytest.fixture
def make_equipment(api, make_circuit):
    def build(circuit_id=None, **over):
        if circuit_id is None:
            circuit_id = make_circuit()["id"]
        body = {"type": "dynalite", "brand": "Philips", "watt": 1200, **over}
        res = api.post(f"/api/circuits/{circuit_id}/equipment", json=body)
        assert res.status_code == 200, res.text
        return res.json()
    return build


@pytest.fixture
def make_channel(api, make_equipment):
    def build(equipment_id=None, number=1, **over):
        if equipment_id is None:
            equipment_id = make_equipment()["id"]
        res = api.post(f"/api/equipment/{equipment_id}/channels",
                       json={"number": number, **over})
        assert res.status_code == 200, res.text
        return res.json()
    return build


@pytest.fixture
def unique():
    """A suffix unique to this test.

    The suite runs against a real, persistent instance rather than a fresh
    database per test, so anything created under a fixed name collides the
    second time the suite is run. That is inherent to testing over HTTP and
    has to be designed for rather than worked around.
    """
    return uuid.uuid4().hex[:8]


JPEG = b"\xff\xd8\xff" + b"kontraktbilde"


@pytest.fixture
def upload(api):
    """Attach a file to a connection point or a piece of equipment."""
    import io

    def build(*, connection_point_id=None, equipment_id=None):
        if connection_point_id is not None:
            url = f"/api/connection_points/{connection_point_id}/files"
        elif equipment_id is not None:
            url = f"/api/equipment/{equipment_id}/files"
        else:
            raise ValueError("oppgi connection_point_id eller equipment_id")
        res = api.post(url, files={"file": ("bilde.jpg", io.BytesIO(JPEG), "image/jpeg")})
        assert res.status_code == 200, res.text
        return res.json()
    return build
