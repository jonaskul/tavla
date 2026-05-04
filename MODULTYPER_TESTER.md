# Tavla – Modultype-administrasjon: Tester og akseptansekriterier

## Bakgrunn
Modultyper er nå DB-drevet via `ModuleTypeDefinition` i stedet for hardkodet enum.
Siden `/innstillinger/modultyper` lar brukeren administrere alle modultyper globalt.

---

## Akseptansekriterier

### AC-1: Innstillingsside tilgjengelig
- [ ] "Innstillinger" vises i navbar og navigerer til `/innstillinger/modultyper`
- [ ] Siden laster uten feil
- [ ] Alle innebygde typer er pre-seedet og vises ved første oppstart

### AC-2: Liste over modultyper
- [ ] Alle typer vises med: fargeklatt, forkortelse, navn, kan-ha-kurs-badge, kan-ha-ampere-badge, antall moduler i bruk
- [ ] Innebygde typer er tydelig markert (f.eks. "Innebygd"-badge)
- [ ] Egendefinerte typer er tydelig skilt fra innebygde
- [ ] Listen er sortert: innebygde først, deretter egendefinerte

### AC-3: Opprett egendefinert modultype
- [ ] "Legg til modultype"-knapp åpner skjema
- [ ] Felter: navn (påkrevd), farge (påkrevd), forkortelse (maks 3 tegn, påkrevd), kan ha kurs (toggle), kan ha ampere (toggle)
- [ ] Fargevelger viser minimum 16 forhåndsdefinerte fargeflater
- [ ] Valgt farge vises med hakemerke
- [ ] Ny type vises umiddelbart i listen
- [ ] Duplikat `key` (utledet fra navn) blokkeres med feilmelding (400)

### AC-4: Rediger modultype
- [ ] Klikk "Rediger" åpner skjema pre-fylt med eksisterende verdier
- [ ] Alle felter kan endres — inkludert innebygde typer
- [ ] Endringer vises umiddelbart i listen og i skap-mockup
- [ ] `key` kan ikke endres (vises som read-only)

### AC-5: Slett modultype
- [ ] Innebygd type uten bruk: kan slettes
- [ ] Innebygd type i bruk: slett-knapp deaktivert med tooltip "I bruk av X moduler"
- [ ] Egendefinert type uten bruk: kan slettes med bekreftelsesdialog
- [ ] Egendefinert type i bruk: slett-knapp deaktivert med tooltip
- [ ] Slett-knapp viser antall moduler som bruker typen

### AC-6: ModuleDialog bruker DB-drevne typer
- [ ] Type-dropdown i ModuleDialog henter fra `GET /api/module_types`
- [ ] Ampere-felt vises/skjules basert på `can_have_ampere`
- [ ] Kurskoblings-felt vises/skjules basert på `can_have_circuit`
- [ ] Farge og forkortelse i skap-canvas hentes fra `ModuleTypeDefinition`
- [ ] Ny egendefinert type vises umiddelbart i ModuleDialog uten reload

### AC-7: Seeding av innebygde typer
- [ ] Alle 8 innebygde typer er tilstede ved første oppstart
- [ ] Seeding kjøres ikke på nytt hvis typer allerede finnes
- [ ] Eksisterende moduler i databasen er kompatible etter migrering

### AC-8: Norske tekster
- [ ] Alle UI-tekster fra `i18n/no.js`
- [ ] "Innebygd", "Egendefinert", "I bruk av X moduler", "Kan ha kurs", "Kan ha ampere"

---

## Backend-tester (pytest)

```python
# backend/tests/test_module_types.py

def test_builtin_types_seeded(client):
    res = client.get("/api/module_types")
    assert res.status_code == 200
    types = res.json()
    keys = [t["key"] for t in types]
    for expected in ["breaker", "rcd", "rcd_breaker", "shelly",
                     "dynalite", "surge_protection", "main_switch", "other"]:
        assert expected in keys

def test_builtin_types_seeded_only_once(client):
    # Call twice — should not duplicate
    client.get("/api/module_types")
    client.get("/api/module_types")
    res = client.get("/api/module_types")
    types = res.json()
    keys = [t["key"] for t in types]
    assert len(keys) == len(set(keys))

def test_builtin_types_sorted_first(client):
    res = client.get("/api/module_types")
    types = res.json()
    builtin_indices = [i for i, t in enumerate(types) if t["is_builtin"]]
    custom_indices = [i for i, t in enumerate(types) if not t["is_builtin"]]
    if custom_indices:
        assert max(builtin_indices) < min(custom_indices)

def test_create_custom_module_type(client):
    res = client.post("/api/module_types", json={
        "key": "my_custom",
        "name_no": "Min egendefinerte",
        "color": "#3b82f6",
        "abbreviation": "MC",
        "can_have_circuit": True,
        "can_have_ampere": True
    })
    assert res.status_code == 200
    data = res.json()
    assert data["key"] == "my_custom"
    assert data["is_builtin"] == False

def test_create_duplicate_key_blocked(client):
    client.post("/api/module_types", json={
        "key": "duplicate", "name_no": "Test",
        "color": "#000000", "abbreviation": "TS",
        "can_have_circuit": False, "can_have_ampere": False
    })
    res = client.post("/api/module_types", json={
        "key": "duplicate", "name_no": "Test 2",
        "color": "#ffffff", "abbreviation": "T2",
        "can_have_circuit": False, "can_have_ampere": False
    })
    assert res.status_code == 400

def test_abbreviation_max_3_chars(client):
    res = client.post("/api/module_types", json={
        "key": "toolong", "name_no": "For lang",
        "color": "#000000", "abbreviation": "ABCD",
        "can_have_circuit": False, "can_have_ampere": False
    })
    assert res.status_code == 422

def test_update_module_type(client):
    res = client.get("/api/module_types")
    breaker = next(t for t in res.json() if t["key"] == "breaker")
    res = client.put(f"/api/module_types/{breaker['id']}", json={
        **breaker, "name_no": "Oppdatert navn", "color": "#ff0000"
    })
    assert res.status_code == 200
    assert res.json()["name_no"] == "Oppdatert navn"
    assert res.json()["color"] == "#ff0000"

def test_update_key_blocked(client):
    res = client.get("/api/module_types")
    breaker = next(t for t in res.json() if t["key"] == "breaker")
    res = client.put(f"/api/module_types/{breaker['id']}", json={
        **breaker, "key": "new_key"
    })
    # key should be ignored or return 400
    result = client.get(f"/api/module_types/{breaker['id']}").json()
    assert result["key"] == "breaker"

def test_delete_custom_type_not_in_use(client):
    create = client.post("/api/module_types", json={
        "key": "deleteme", "name_no": "Slett meg",
        "color": "#000000", "abbreviation": "DM",
        "can_have_circuit": False, "can_have_ampere": False
    })
    type_id = create.json()["id"]
    res = client.delete(f"/api/module_types/{type_id}")
    assert res.status_code == 200

def test_delete_type_in_use_blocked(client, panel_factory):
    # Create custom type
    create = client.post("/api/module_types", json={
        "key": "inuse", "name_no": "I bruk",
        "color": "#000000", "abbreviation": "IB",
        "can_have_circuit": False, "can_have_ampere": False
    })
    type_id = create.json()["id"]

    # Place a module using this type
    panel = panel_factory()
    client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1,
        "type": "inuse", "label": "Test"
    })

    res = client.delete(f"/api/module_types/{type_id}")
    assert res.status_code == 409

def test_delete_builtin_type_in_use_blocked(client, panel_factory):
    panel = panel_factory()
    client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1,
        "type": "breaker", "label": "B01", "ampere": 16
    })
    res = client.get("/api/module_types")
    breaker = next(t for t in res.json() if t["key"] == "breaker")
    res = client.delete(f"/api/module_types/{breaker['id']}")
    assert res.status_code == 409

def test_delete_builtin_type_not_in_use_allowed(client):
    # surge_protection is unlikely to be in use in test DB
    res = client.get("/api/module_types")
    surge = next(t for t in res.json() if t["key"] == "surge_protection")
    res = client.delete(f"/api/module_types/{surge['id']}")
    assert res.status_code == 200

def test_usage_count_endpoint(client, panel_factory):
    panel = panel_factory()
    client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1,
        "type": "breaker", "label": "B01", "ampere": 16
    })
    res = client.get("/api/module_types/breaker/usage")
    assert res.status_code == 200
    assert res.json()["count"] >= 1

def test_can_have_circuit_false_blocks_circuit(client, panel_factory, circuit_factory):
    # Create type with can_have_circuit=False
    client.post("/api/module_types", json={
        "key": "nocircuit", "name_no": "Ingen kurs",
        "color": "#000000", "abbreviation": "NK",
        "can_have_circuit": False, "can_have_ampere": False
    })
    panel = panel_factory()
    circuit = circuit_factory(panel_id=panel["id"])
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1,
        "type": "nocircuit", "circuit_id": circuit["id"]
    })
    assert res.status_code == 400

def test_module_type_not_found(client):
    res = client.get("/api/module_types/99999")
    assert res.status_code == 404
```

---

## Frontend-tester (Vitest)

```javascript
// frontend/src/__tests__/ModuleTypeAdmin.test.jsx

import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import ModuleTypeAdmin from '../pages/ModuleTypeAdmin'
import * as api from '../api/client'

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={['/innstillinger/modultyper']}>
      <Routes>
        <Route path="/innstillinger/modultyper" element={children} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>
)

const mockTypes = [
  { id: 1, key: 'breaker', name_no: 'Automatsikring', color: '#2563eb',
    abbreviation: 'LS', can_have_circuit: true, can_have_ampere: true,
    is_builtin: true, usage_count: 3 },
  { id: 2, key: 'rcd', name_no: 'Jordfeilbryter', color: '#ca8a04',
    abbreviation: 'JF', can_have_circuit: false, can_have_ampere: true,
    is_builtin: true, usage_count: 0 },
  { id: 3, key: 'my_custom', name_no: 'Min type', color: '#ff0000',
    abbreviation: 'MT', can_have_circuit: true, can_have_ampere: false,
    is_builtin: false, usage_count: 0 },
]

test('viser alle modultyper', async () => {
  vi.spyOn(api, 'getModuleTypes').mockResolvedValue(mockTypes)
  render(<ModuleTypeAdmin />, { wrapper })
  await waitFor(() => screen.getByText('Automatsikring'))
  expect(screen.getByText('Jordfeilbryter')).toBeInTheDocument()
  expect(screen.getByText('Min type')).toBeInTheDocument()
})

test('innebygde typer er markert', async () => {
  vi.spyOn(api, 'getModuleTypes').mockResolvedValue(mockTypes)
  render(<ModuleTypeAdmin />, { wrapper })
  await waitFor(() => screen.getAllByText(/innebygd/i))
  expect(screen.getAllByText(/innebygd/i)).toHaveLength(2)
})

test('slett-knapp deaktivert for type i bruk', async () => {
  vi.spyOn(api, 'getModuleTypes').mockResolvedValue(mockTypes)
  render(<ModuleTypeAdmin />, { wrapper })
  await waitFor(() => screen.getByText('Automatsikring'))
  // breaker has usage_count: 3 — delete should be disabled
  const rows = screen.getAllByTestId('module-type-row')
  const breakerRow = rows[0]
  const deleteBtn = breakerRow.querySelector('[data-testid="delete-btn"]')
  expect(deleteBtn).toBeDisabled()
})

test('slett-knapp aktiv for type ikke i bruk', async () => {
  vi.spyOn(api, 'getModuleTypes').mockResolvedValue(mockTypes)
  render(<ModuleTypeAdmin />, { wrapper })
  await waitFor(() => screen.getByText('Min type'))
  const rows = screen.getAllByTestId('module-type-row')
  const customRow = rows[2]
  const deleteBtn = customRow.querySelector('[data-testid="delete-btn"]')
  expect(deleteBtn).not.toBeDisabled()
})

test('skjema validerer forkortelse maks 3 tegn', async () => {
  vi.spyOn(api, 'getModuleTypes').mockResolvedValue([])
  render(<ModuleTypeAdmin />, { wrapper })
  await userEvent.click(await screen.findByText(/legg til modultype/i))
  await userEvent.type(screen.getByLabelText(/forkortelse/i), 'ABCD')
  await userEvent.click(screen.getByText(/lagre/i))
  expect(screen.getByText(/maks 3 tegn/i)).toBeInTheDocument()
})

test('skjema validerer påkrevde felt', async () => {
  vi.spyOn(api, 'getModuleTypes').mockResolvedValue([])
  render(<ModuleTypeAdmin />, { wrapper })
  await userEvent.click(await screen.findByText(/legg til modultype/i))
  await userEvent.click(screen.getByText(/lagre/i))
  expect(screen.getByText(/navn er påkrevd/i)).toBeInTheDocument()
})

test('fargevelger viser minimum 16 fargeflater', async () => {
  vi.spyOn(api, 'getModuleTypes').mockResolvedValue([])
  render(<ModuleTypeAdmin />, { wrapper })
  await userEvent.click(await screen.findByText(/legg til modultype/i))
  const swatches = screen.getAllByTestId('color-swatch')
  expect(swatches.length).toBeGreaterThanOrEqual(16)
})

test('valgt farge vises med hakemerke', async () => {
  vi.spyOn(api, 'getModuleTypes').mockResolvedValue([])
  render(<ModuleTypeAdmin />, { wrapper })
  await userEvent.click(await screen.findByText(/legg til modultype/i))
  const swatches = screen.getAllByTestId('color-swatch')
  await userEvent.click(swatches[0])
  expect(swatches[0]).toHaveAttribute('aria-selected', 'true')
})

test('innstillinger-lenke vises i navbar', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  )
  expect(screen.getByRole('link', { name: /innstillinger/i })).toBeInTheDocument()
})
```

```javascript
// frontend/src/__tests__/ModuleDialogDynamic.test.jsx
// Verify ModuleDialog uses DB-driven types

test('ModuleDialog henter typer fra API', async () => {
  vi.spyOn(api, 'getModuleTypes').mockResolvedValue(mockTypes)
  render(<ModuleDialog open={true} onClose={() => {}} onSave={() => {}} circuits={[]} />, { wrapper })
  await waitFor(() => screen.getByText('Automatsikring'))
  expect(screen.getByText('Jordfeilbryter')).toBeInTheDocument()
  expect(screen.getByText('Min type')).toBeInTheDocument()
})

test('ampere-felt skjules for type med can_have_ampere=false', async () => {
  vi.spyOn(api, 'getModuleTypes').mockResolvedValue(mockTypes)
  render(<ModuleDialog open={true} onClose={() => {}} onSave={() => {}} circuits={[]} />, { wrapper })
  await waitFor(() => screen.getByLabelText(/type/i))
  fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'my_custom' } })
  expect(screen.queryByLabelText(/ampere/i)).not.toBeInTheDocument()
})

test('kurs-felt skjules for type med can_have_circuit=false', async () => {
  vi.spyOn(api, 'getModuleTypes').mockResolvedValue(mockTypes)
  render(<ModuleDialog open={true} onClose={() => {}} onSave={() => {}} circuits={[{ id: 1, designation: 'B01', name: 'Lys' }]} />, { wrapper })
  await waitFor(() => screen.getByLabelText(/type/i))
  fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'rcd' } })
  expect(screen.queryByLabelText(/kursbetegnelse/i)).not.toBeInTheDocument()
})
```

---

## Kjøre testene

```bash
# Backend
cd backend && pytest tests/test_module_types.py -v

# Frontend
cd frontend && npm run test -- ModuleTypeAdmin ModuleDialogDynamic

# Alle faser
cd backend && pytest tests/ -v
cd frontend && npm run test
```

---

## Smoketest

```
Start backend and frontend, then smoke test module type administration:

LISTE OG SEEDING:
- Navigate to /innstillinger/modultyper
- Verify all 8 built-in types are present
- Verify built-in badge is shown for each

OPPRETT EGENDEFINERT TYPE:
- Click "Legg til modultype"
- Fill in: name "Test relé", abbreviation "TR", select a color, can_have_circuit=true, can_have_ampere=true
- Save — verify it appears in the list as custom type
- Attempt to create with abbreviation "ABCD" — verify validation error

REDIGER:
- Edit "Automatsikring" — change name to "Automatsikring (LS)" and color
- Verify change appears in list
- Open panel mockup — verify updated color and name in ModuleDialog

BRUK-KONTROLL:
- Place a module of type "Test relé" in a panel
- Return to /innstillinger/modultyper — verify usage count shows 1
- Attempt to delete "Test relé" — verify blocked with 409
- Delete the module in the panel
- Return and delete "Test relé" — verify success

SLETTING AV INNEBYGD TYPE:
- Ensure no modules use "Overspenningsvern"
- Delete it — verify success
- Verify it no longer appears in ModuleDialog

Report HTTP status and result for each step.
```

---

## Definition of Done

Modultype-administrasjon er ferdig når:
- [ ] Alle backend-tester grønne
- [ ] Alle frontend-tester grønne
- [ ] Alle 8 akseptansekriterier manuelt verifisert
- [ ] Alle 8 innebygde typer er seedet ved oppstart
- [ ] Seeding kjøres ikke dobbelt
- [ ] ModuleDialog bruker DB-drevne typer
- [ ] Slett blokkeres korrekt ved bruk (409)
- [ ] Alembic-migrering kjørt uten datatap
- [ ] Smoketest fullført uten feil
- [ ] Ingen hardkodede norske strenger utenfor `i18n/no.js`
