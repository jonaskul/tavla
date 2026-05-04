# Tavla – Fase 1: Tester og akseptansekriterier

## Akseptansekriterier

### AC-1: Backend starter uten feil
- [ ] `uvicorn main:app --reload` starter uten exceptions
- [ ] `GET /api/health` returnerer `{"status": "ok"}`
- [ ] `tavla.db` opprettes automatisk ved oppstart
- [ ] `/docs` (Swagger UI) er tilgjengelig og viser alle endepunkter

### AC-2: CRUD for eiendommer (Property)
- [ ] Kan opprette eiendom med navn og adresse
- [ ] Kan hente liste over alle eiendommer
- [ ] Kan hente enkelt eiendom med ID
- [ ] Kan oppdatere navn og adresse
- [ ] Kan slette eiendom
- [ ] Slett eiendom som har skap returnerer 400/409 (ikke tillatt)
- [ ] Hent eiendom med ugyldig ID returnerer 404

### AC-3: CRUD for sikringsskap (Panel)
- [ ] Kan opprette skap knyttet til eiendom
- [ ] Kan ikke opprette skap med ugyldig `property_id` (404)
- [ ] Kan hente alle skap for en eiendom
- [ ] Kan oppdatere navn, plassering, rader og moduler per rad
- [ ] Kan slette skap
- [ ] Slett skap som har kurser returnerer 400/409

### AC-4: CRUD for kurser (Circuit)
- [ ] Kan opprette kurs knyttet til skap
- [ ] Kan ikke opprette kurs med ugyldig `panel_id` (404)
- [ ] Kan hente alle kurser for et skap
- [ ] Kursbetegnelse er unik per skap (duplikat returnerer 400)
- [ ] Kan oppdatere alle felter
- [ ] Kan slette kurs
- [ ] Slett kurs som har koblingspunkter returnerer 400/409

### AC-5: CRUD for koblingspunkter (ConnectionPoint)
- [ ] Kan opprette koblingspunkt knyttet til kurs
- [ ] Kan hente alle koblingspunkter for en kurs
- [ ] Kan oppdatere type, plassering og kommentar
- [ ] Kan slette koblingspunkt

### AC-6: CRUD for fastmontert utstyr (Equipment)
- [ ] Kan opprette utstyr knyttet til kurs
- [ ] Kan hente alt utstyr for en kurs
- [ ] Kan oppdatere alle felter
- [ ] Kan slette utstyr

### AC-7: Endringslogg (ChangeLog)
- [ ] Kan opprette logginnslag knyttet til kurs
- [ ] Kan opprette logginnslag knyttet til koblingspunkt
- [ ] Kan hente alle logginnslag for en kurs
- [ ] Kan hente alle logginnslag for et koblingspunkt
- [ ] Logginnslag kan ikke slettes eller redigeres (append-only)

### AC-8: Frontend – navigasjon og layout
- [ ] Applikasjonen starter med `npm run dev` uten feil
- [ ] Navbar viser appnavn "Tavla" og navigasjonslenker
- [ ] Alle norske UI-tekster hentes fra `i18n/no.js` — ingen hardkodede norske strenger i komponenter
- [ ] Ukjent URL viser 404-side med lenke tilbake

### AC-9: Frontend – eiendommer (`/`)
- [ ] Viser liste over alle eiendommer
- [ ] Viser melding når ingen eiendommer er registrert
- [ ] "Legg til eiendom"-knapp åpner skjema
- [ ] Skjema validerer at navn og adresse er fylt ut
- [ ] Ny eiendom vises i listen uten full reload
- [ ] Klikk på eiendom navigerer til `/eiendommer/:id`

### AC-10: Frontend – eiendomsdetaljer (`/eiendommer/:id`)
- [ ] Viser navn og adresse for eiendommen
- [ ] Viser liste over tilknyttede skap
- [ ] "Legg til skap"-knapp åpner skjema med felt for navn, plassering, rader og moduler per rad
- [ ] Nytt skap vises i listen uten full reload
- [ ] Klikk på skap navigerer til `/skap/:id`
- [ ] Ugyldig eiendoms-ID viser feilmelding

### AC-11: Frontend – skap (`/skap/:id`)
- [ ] Viser skapnavn og plassering
- [ ] Viser placeholder-tekst: "Skap-mockup kommer i Fase 2"
- [ ] Viser liste over kurser for skapet
- [ ] Klikk på kurs navigerer til `/kurs/:id`

### AC-12: Frontend – kurs (`/kurs/:id`)
- [ ] Viser kursbetegnelse og navn
- [ ] Viser alle kursdetaljer (kabeltype, tverrsnitt, lengde etc.)
- [ ] Viser placeholder for koblingspunkter og utstyr: "Kommer i Fase 3"
- [ ] Ugyldig kurs-ID viser feilmelding

---

## Backend-tester (pytest)

```python
# backend/tests/test_properties.py

def test_create_property(client):
    res = client.post("/api/properties", json={"name": "Hjemme", "address": "Testveien 1, 1640 Råde"})
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Hjemme"
    assert data["id"] is not None

def test_get_properties_empty(client):
    res = client.get("/api/properties")
    assert res.status_code == 200
    assert res.json() == []

def test_get_property_not_found(client):
    res = client.get("/api/properties/999")
    assert res.status_code == 404

def test_update_property(client, property_factory):
    prop = property_factory()
    res = client.put(f"/api/properties/{prop['id']}", json={"name": "Hytta", "address": "Hytteveien 2"})
    assert res.status_code == 200
    assert res.json()["name"] == "Hytta"

def test_delete_property(client, property_factory):
    prop = property_factory()
    res = client.delete(f"/api/properties/{prop['id']}")
    assert res.status_code == 200
    assert client.get(f"/api/properties/{prop['id']}").status_code == 404

def test_delete_property_with_panels_blocked(client, panel_factory):
    panel = panel_factory()
    res = client.delete(f"/api/properties/{panel['property_id']}")
    assert res.status_code in [400, 409]
```

```python
# backend/tests/test_panels.py

def test_create_panel(client, property_factory):
    prop = property_factory()
    res = client.post(f"/api/properties/{prop['id']}/panels", json={
        "name": "Hovedtavle",
        "location": "Gang 1. etg",
        "rows": 2,
        "modules_per_row": 12
    })
    assert res.status_code == 200
    assert res.json()["rows"] == 2

def test_create_panel_invalid_property(client):
    res = client.post("/api/properties/999/panels", json={
        "name": "Tavle", "location": "Gang", "rows": 1, "modules_per_row": 12
    })
    assert res.status_code == 404

def test_delete_panel_with_circuits_blocked(client, circuit_factory):
    circuit = circuit_factory()
    res = client.delete(f"/api/panels/{circuit['panel_id']}")
    assert res.status_code in [400, 409]
```

```python
# backend/tests/test_circuits.py

def test_create_circuit(client, panel_factory):
    panel = panel_factory()
    res = client.post(f"/api/panels/{panel['id']}/circuits", json={
        "designation": "B01",
        "name": "Lys stue",
        "room": "Stue",
        "cable_type": "NYM-J",
        "cross_section": 1.5,
        "conductor_count": 3,
        "length_m": 12.0
    })
    assert res.status_code == 200
    assert res.json()["designation"] == "B01"

def test_duplicate_designation_in_same_panel(client, panel_factory):
    panel = panel_factory()
    payload = {"designation": "B01", "name": "Lys", "room": "Stue"}
    client.post(f"/api/panels/{panel['id']}/circuits", json=payload)
    res = client.post(f"/api/panels/{panel['id']}/circuits", json=payload)
    assert res.status_code == 400

def test_same_designation_different_panels(client, panel_factory):
    p1, p2 = panel_factory(), panel_factory()
    payload = {"designation": "B01", "name": "Lys", "room": "Stue"}
    r1 = client.post(f"/api/panels/{p1['id']}/circuits", json=payload)
    r2 = client.post(f"/api/panels/{p2['id']}/circuits", json=payload)
    assert r1.status_code == 200
    assert r2.status_code == 200
```

```python
# backend/tests/test_changelog.py

def test_changelog_is_append_only(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post("/api/changelog", json={
        "circuit_id": circuit["id"],
        "changed_by": "Jonas",
        "description": "Byttet sikring fra B16 til B20"
    })
    assert res.status_code == 200
    log_id = res.json()["id"]

    # Skal ikke kunne slette
    assert client.delete(f"/api/changelog/{log_id}").status_code == 405

    # Skal ikke kunne redigere
    assert client.put(f"/api/changelog/{log_id}", json={"description": "Endret"}).status_code == 405

def test_changelog_requires_entity(client):
    # Logginnslag uten tilknyttet entitet skal avvises
    res = client.post("/api/changelog", json={
        "changed_by": "Jonas",
        "description": "Noe skjedde"
    })
    assert res.status_code == 422
```

```python
# backend/tests/conftest.py

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, Session
from main import app
from database import get_session

@pytest.fixture(name="client")
def client_fixture():
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)

    def get_test_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = get_test_session
    yield TestClient(app)
    app.dependency_overrides.clear()

@pytest.fixture
def property_factory(client):
    def make(name="Testbolig", address="Testveien 1"):
        return client.post("/api/properties", json={"name": name, "address": address}).json()
    return make

@pytest.fixture
def panel_factory(client, property_factory):
    def make():
        prop = property_factory()
        return client.post(f"/api/properties/{prop['id']}/panels", json={
            "name": "Hovedtavle", "location": "Gang", "rows": 1, "modules_per_row": 12
        }).json()
    return make

@pytest.fixture
def circuit_factory(client, panel_factory):
    def make():
        panel = panel_factory()
        return client.post(f"/api/panels/{panel['id']}/circuits", json={
            "designation": "B01", "name": "Lys stue", "room": "Stue"
        }).json()
    return make
```

---

## Frontend-tester (Vitest + React Testing Library)

```javascript
// frontend/src/__tests__/PropertyList.test.jsx

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import Properties from '../pages/Properties'
import { vi } from 'vitest'
import * as api from '../api/client'

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
)

test('viser melding når ingen eiendommer finnes', async () => {
  vi.spyOn(api, 'getProperties').mockResolvedValue([])
  render(<Properties />, { wrapper })
  await waitFor(() => screen.getByText(/ingen eiendommer/i))
})

test('viser liste over eiendommer', async () => {
  vi.spyOn(api, 'getProperties').mockResolvedValue([
    { id: 1, name: 'Hjemme', address: 'Testveien 1' }
  ])
  render(<Properties />, { wrapper })
  await waitFor(() => screen.getByText('Hjemme'))
})

test('skjema validerer påkrevde felt', async () => {
  vi.spyOn(api, 'getProperties').mockResolvedValue([])
  render(<Properties />, { wrapper })
  await userEvent.click(screen.getByText(/legg til eiendom/i))
  await userEvent.click(screen.getByText(/lagre/i))
  expect(screen.getByText(/navn er påkrevd/i)).toBeInTheDocument()
})
```

---

## Kjøre testene

```bash
# Backend
cd backend
pip install pytest httpx
pytest tests/ -v

# Frontend
cd frontend
npm run test
```

---

## Definition of Done – Fase 1

Fase 1 er ferdig når:
- [ ] Alle backend-tester er grønne
- [ ] Alle frontend-tester er grønne
- [ ] Alle 12 akseptansekriterier er oppfylt og manuelt verifisert
- [ ] API-dokumentasjon på `/docs` er komplett
- [ ] Ingen hardkodede norske strenger utenfor `i18n/no.js`
- [ ] Kode er pushet til `main`-branch på GitHub
