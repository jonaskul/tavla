# Tavla – Fase 4: Tester og akseptansekriterier

## Akseptansekriterier

### AC-1: Utstyrsliste på kursside (`/kurs/:id`)
- [ ] Viser alle utstyrselementer tilknyttet kursen
- [ ] Viser type (norsk navn), merke, modell, effekt (W) og kommentar per element
- [ ] Viser melding når ingen utstyr er registrert
- [ ] Fase 3-placeholder for utstyr er erstattet med ekte innhold

### AC-2: Opprett utstyr
- [ ] "Legg til utstyr"-knapp åpner skjema
- [ ] Type-dropdown viser alle 5 typer med norske navn:
  - Varmekabler
  - Elbillader
  - Varmepumpe
  - Varmtvannsbereder
  - Annet
- [ ] Felter: type (påkrevd), merke, modell, effekt W, kommentar
- [ ] Nytt utstyr vises umiddelbart uten full reload
- [ ] Skjema validerer at type er valgt

### AC-3: Rediger utstyr
- [ ] Klikk på utstyr åpner redigeringsskjema pre-fylt
- [ ] Alle felter kan endres
- [ ] Endringer lagres og vises umiddelbart

### AC-4: Slett utstyr
- [ ] Slett med bekreftelsesdialog
- [ ] Utstyr med filer kan ikke slettes uten å slette filer først (409)
- [ ] Viser tydelig feilmelding ved 409

### AC-5: Filoppplasting på utstyr
- [ ] Samme FileUpload-komponent som for koblingspunkter
- [ ] Støtter JPG, PNG og PDF
- [ ] Thumbnail for bilder, PDF-ikon for PDF
- [ ] Slett fil med bekreftelse
- [ ] Filer lagres under `/opt/tavla/uploads/equipment/{equipment_id}/`

### AC-6: Utstyr i endringslogg
- [ ] Opprett utstyr logges automatisk med norsk beskrivelse
- [ ] Slett utstyr logges automatisk
- [ ] Logginnslag vises på kurssiden

### AC-7: Utstyrssammendrag på skapsiden
- [ ] `/skap/:id` viser totalt antall utstyrselementer som badge
- [ ] Klikk på badge filtrerer kurslisten til kun kurser med utstyr

### AC-8: Norske tekster
- [ ] Alle UI-tekster hentes fra `i18n/no.js`
- [ ] Nye strenger lagt til i `i18n/no.js` før bruk
- [ ] Utstyrtyper vises med norske navn overalt

---

## Backend-tester (pytest)

```python
# backend/tests/test_equipment.py

def test_create_equipment(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(f"/api/circuits/{circuit['id']}/equipment", json={
        "type": "floor_heating",
        "brand": "Nexans",
        "model": "DEFHEAT 20",
        "watt": 1200,
        "notes": "Bad 1. etg"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "floor_heating"
    assert data["watt"] == 1200

def test_create_equipment_invalid_type(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(f"/api/circuits/{circuit['id']}/equipment", json={
        "type": "ugyldig_type"
    })
    assert res.status_code == 422

def test_create_equipment_type_required(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(f"/api/circuits/{circuit['id']}/equipment", json={
        "brand": "Nexans"
    })
    assert res.status_code == 422

def test_get_equipment_for_circuit(client, circuit_factory):
    circuit = circuit_factory()
    client.post(f"/api/circuits/{circuit['id']}/equipment", json={"type": "ev_charger"})
    client.post(f"/api/circuits/{circuit['id']}/equipment", json={"type": "boiler"})
    res = client.get(f"/api/circuits/{circuit['id']}/equipment")
    assert res.status_code == 200
    assert len(res.json()) == 2

def test_get_equipment_empty(client, circuit_factory):
    circuit = circuit_factory()
    res = client.get(f"/api/circuits/{circuit['id']}/equipment")
    assert res.status_code == 200
    assert res.json() == []

def test_update_equipment(client, equipment_factory):
    eq = equipment_factory()
    res = client.put(f"/api/equipment/{eq['id']}", json={
        **eq, "watt": 2400, "brand": "Oppdatert merke"
    })
    assert res.status_code == 200
    assert res.json()["watt"] == 2400
    assert res.json()["brand"] == "Oppdatert merke"

def test_delete_equipment(client, equipment_factory):
    eq = equipment_factory()
    res = client.delete(f"/api/equipment/{eq['id']}")
    assert res.status_code == 200
    res2 = client.get(f"/api/circuits/{eq['circuit_id']}/equipment")
    assert not any(e["id"] == eq["id"] for e in res2.json())

def test_delete_equipment_with_files_blocked(client, equipment_file_factory):
    file = equipment_file_factory()
    res = client.delete(f"/api/equipment/{file['equipment_id']}")
    assert res.status_code in [400, 409]

def test_equipment_changelog_created_automatically(client, circuit_factory):
    circuit = circuit_factory()
    client.post(f"/api/circuits/{circuit['id']}/equipment", json={
        "type": "floor_heating", "brand": "Nexans", "watt": 1200
    })
    res = client.get(f"/api/circuits/{circuit['id']}/changelog")
    assert res.status_code == 200
    assert len(res.json()) >= 1
    assert any("varmekabler" in e["description"].lower() or
               "floor_heating" in e["description"].lower()
               for e in res.json())

def test_equipment_invalid_circuit(client):
    res = client.post("/api/circuits/999/equipment", json={"type": "boiler"})
    assert res.status_code == 404
```

```python
# backend/tests/test_files.py (utvidet med utstyr)

def test_upload_file_to_equipment(client, equipment_factory):
    eq = equipment_factory()
    import io
    fake_image = io.BytesIO(b"fake jpeg content")
    res = client.post(
        f"/api/files/upload?equipment_id={eq['id']}",
        files={"file": ("datablad.jpg", fake_image, "image/jpeg")}
    )
    assert res.status_code == 200
    assert res.json()["equipment_id"] == eq["id"]

def test_file_must_have_exactly_one_parent(client, equipment_factory, connection_point_factory):
    eq = equipment_factory()
    cp = connection_point_factory()
    import io
    fake_image = io.BytesIO(b"fake jpeg")
    res = client.post(
        f"/api/files/upload?equipment_id={eq['id']}&connection_point_id={cp['id']}",
        files={"file": ("test.jpg", fake_image, "image/jpeg")}
    )
    assert res.status_code == 400
```

```python
# Legg til i backend/tests/conftest.py

@pytest.fixture
def equipment_factory(client, circuit_factory):
    def make(circuit_id=None, type="floor_heating", watt=1200):
        if circuit_id is None:
            circuit = circuit_factory()
            circuit_id = circuit["id"]
        return client.post(f"/api/circuits/{circuit_id}/equipment", json={
            "type": type,
            "watt": watt
        }).json()
    return make

@pytest.fixture
def equipment_file_factory(client, equipment_factory):
    def make(equipment_id=None):
        if equipment_id is None:
            eq = equipment_factory()
            equipment_id = eq["id"]
        import io
        fake_image = io.BytesIO(b"fake jpeg content")
        return client.post(
            f"/api/files/upload?equipment_id={equipment_id}",
            files={"file": ("test.jpg", fake_image, "image/jpeg")}
        ).json()
    return make
```

---

## Frontend-tester (Vitest)

```javascript
// frontend/src/__tests__/Equipment.test.jsx

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import EquipmentList from '../components/EquipmentList'
import * as api from '../api/client'

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
)

const mockEquipment = [
  { id: 1, circuit_id: 1, type: 'floor_heating', brand: 'Nexans', model: 'DEFHEAT 20', watt: 1200, notes: 'Bad 1. etg' },
  { id: 2, circuit_id: 1, type: 'ev_charger', brand: 'Easee', model: 'Home', watt: 7400, notes: '' }
]

test('viser melding når ingen utstyr er registrert', async () => {
  vi.spyOn(api, 'getEquipment').mockResolvedValue([])
  render(<EquipmentList circuitId={1} />, { wrapper })
  await waitFor(() => screen.getByText(/ingen utstyr/i))
})

test('viser utstyrsliste med norske typenavn', async () => {
  vi.spyOn(api, 'getEquipment').mockResolvedValue(mockEquipment)
  render(<EquipmentList circuitId={1} />, { wrapper })
  await waitFor(() => screen.getByText('Varmekabler'))
  expect(screen.getByText('Elbillader')).toBeInTheDocument()
  expect(screen.getByText('Nexans')).toBeInTheDocument()
  expect(screen.getByText('1200 W')).toBeInTheDocument()
})

test('skjema validerer at type er valgt', async () => {
  vi.spyOn(api, 'getEquipment').mockResolvedValue([])
  render(<EquipmentList circuitId={1} />, { wrapper })
  await userEvent.click(await screen.findByText(/legg til utstyr/i))
  await userEvent.click(screen.getByText(/lagre/i))
  expect(screen.getByText(/type er påkrevd/i)).toBeInTheDocument()
})

test('alle 5 utstyrstyper vises i dropdown', async () => {
  vi.spyOn(api, 'getEquipment').mockResolvedValue([])
  render(<EquipmentList circuitId={1} />, { wrapper })
  await userEvent.click(await screen.findByText(/legg til utstyr/i))
  const dropdown = screen.getByLabelText(/type/i)
  const options = Array.from(dropdown.querySelectorAll('option')).map(o => o.textContent)
  expect(options).toContain('Varmekabler')
  expect(options).toContain('Elbillader')
  expect(options).toContain('Varmepumpe')
  expect(options).toContain('Varmtvannsbereder')
  expect(options).toContain('Annet')
})

test('redigeringsskjema er pre-fylt med eksisterende verdier', async () => {
  vi.spyOn(api, 'getEquipment').mockResolvedValue(mockEquipment)
  render(<EquipmentList circuitId={1} />, { wrapper })
  await waitFor(() => screen.getByText('Nexans'))
  await userEvent.click(screen.getAllByText(/rediger/i)[0])
  expect(screen.getByDisplayValue('Nexans')).toBeInTheDocument()
  expect(screen.getByDisplayValue('DEFHEAT 20')).toBeInTheDocument()
  expect(screen.getByDisplayValue('1200')).toBeInTheDocument()
})
```

---

## Kjøre testene

```bash
# Backend (alle faser)
cd backend && pytest tests/ -v

# Kun fase 4
cd backend && pytest tests/test_equipment.py -v

# Frontend
cd frontend && npm run test -- Equipment
```

---

## Smoketest – Fase 4

```
Start backend and frontend, then perform a smoke test of Phase 4:
- Navigate to an existing circuit
- Add floor_heating equipment: brand "Nexans", model "DEFHEAT 20", watt 1200
- Verify it appears in the equipment list with Norwegian type name "Varmekabler"
- Upload a JPG to the equipment item
- Verify thumbnail appears
- Edit the equipment and change watt to 2400 — verify change appears
- Attempt to delete equipment with file attached — verify 409 with error message
- Delete the file first, then delete the equipment — verify success
- Verify changelog on the circuit shows equipment was added and deleted
Report HTTP status and result for each step.
```

---

## Definition of Done – Fase 4

Fase 4 er ferdig når:
- [ ] Alle backend-tester er grønne (inkl. fase 1–3)
- [ ] Alle frontend-tester er grønne (inkl. fase 1–3)
- [ ] Alle 8 akseptansekriterier er manuelt verifisert
- [ ] Alle 5 utstyrstyper fungerer med norske navn
- [ ] Filoppplasting på utstyr fungerer
- [ ] Endringslogg oppdateres automatisk
- [ ] Smoketest fullført uten feil
- [ ] Ingen hardkodede norske strenger utenfor `i18n/no.js`
- [ ] Kode pushet til `feature/fase4` og klar for merge
