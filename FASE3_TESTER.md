# Tavla – Fase 3: Tester og akseptansekriterier

## Akseptansekriterier

### AC-1: Kursdetaljer (`/kurs/:id`)
- [ ] Viser kursbetegnelse, navn, rom, kabeltype, tverrsnitt, antall leder, lengde
- [ ] Viser tilknyttet skap og eiendom med lenker tilbake
- [ ] Viser antall koblingspunkter og utstyr som badge
- [ ] Ugyldig kurs-ID viser feilmelding med lenke tilbake
- [ ] Placeholder fra Fase 1 er erstattet med ekte innhold

### AC-2: Koblingspunkter – liste og opprett
- [ ] Viser alle koblingspunkter for kursen
- [ ] Viser type (norsk navn), plassering og kommentar per punkt
- [ ] "Legg til koblingspunkt"-knapp åpner skjema
- [ ] Skjema validerer at type og plassering er fylt ut
- [ ] Nytt koblingspunkt vises uten full reload
- [ ] Viser melding når ingen koblingspunkter er registrert

### AC-3: Koblingspunkter – rediger og slett
- [ ] Klikk på koblingspunkt åpner redigeringsskjema pre-fylt
- [ ] Endringer lagres og vises umiddelbart
- [ ] Slett koblingspunkt med bekreftelsesdialog
- [ ] Koblingspunkt med filer kan ikke slettes uten å slette filer først (400/409)

### AC-4: Filoppplasting – lokal lagring
- [ ] Dra-og-slipp eller klikk for å laste opp fil
- [ ] Støtter JPG, PNG og PDF
- [ ] Maks 20 MB per fil — større filer avvises med feilmelding
- [ ] Opplastet fil vises umiddelbart (thumbnail for bilder, ikon for PDF)
- [ ] Fil lagres lokalt under `/opt/tavla/uploads`
- [ ] Filnavn saniteres (ingen spesialtegn, ingen path traversal)
- [ ] Kan laste opp flere filer til samme koblingspunkt

### AC-5: Filvisning og sletting
- [ ] Klikk på bilde åpner fullskjermvisning (lightbox)
- [ ] Klikk på PDF åpner i ny fane
- [ ] Slett fil med bekreftelsesdialog
- [ ] Fil slettes både fra database og disk

### AC-6: Endringslogg – visning
- [ ] Viser alle logginnslag for kursen kronologisk (nyeste først)
- [ ] Viser tidspunkt, utført av og beskrivelse
- [ ] Viser melding når ingen endringer er registrert
- [ ] Logginnslag kan ikke redigeres eller slettes (ingen knapper)

### AC-7: Endringslogg – registrer endring
- [ ] "Registrer endring"-knapp åpner skjema
- [ ] Felter: utført av (tekst) og beskrivelse (textarea)
- [ ] Begge felter er påkrevd
- [ ] Nytt innslag vises øverst i loggen uten full reload
- [ ] Endringer på koblingspunkter logges automatisk med beskrivelse

### AC-8: Norske tekster
- [ ] Alle UI-tekster hentes fra `i18n/no.js`
- [ ] Nye strenger lagt til i `i18n/no.js` før bruk i komponenter
- [ ] Filtype-feilmeldinger er på norsk

---

## Backend-tester (pytest)

```python
# backend/tests/test_connection_points.py

def test_create_connection_point(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(f"/api/circuits/{circuit['id']}/connection_points", json={
        "type": "junction_box",
        "location": "Tak stue ved balkongdør",
        "notes": "Fordeler til 3 punkter"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "junction_box"
    assert data["location"] == "Tak stue ved balkongdør"

def test_get_connection_points_empty(client, circuit_factory):
    circuit = circuit_factory()
    res = client.get(f"/api/circuits/{circuit['id']}/connection_points")
    assert res.status_code == 200
    assert res.json() == []

def test_update_connection_point(client, connection_point_factory):
    cp = connection_point_factory()
    res = client.put(f"/api/connection_points/{cp['id']}", json={
        **cp, "location": "Oppdatert plassering"
    })
    assert res.status_code == 200
    assert res.json()["location"] == "Oppdatert plassering"

def test_delete_connection_point(client, connection_point_factory):
    cp = connection_point_factory()
    res = client.delete(f"/api/connection_points/{cp['id']}")
    assert res.status_code == 200

def test_delete_connection_point_with_files_blocked(client, file_factory):
    file = file_factory()
    cp_id = file["connection_point_id"]
    res = client.delete(f"/api/connection_points/{cp_id}")
    assert res.status_code in [400, 409]

def test_invalid_connection_point_type(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(f"/api/circuits/{circuit['id']}/connection_points", json={
        "type": "ugyldig_type",
        "location": "Tak"
    })
    assert res.status_code == 422
```

```python
# backend/tests/test_files.py
import io

def test_upload_image(client, connection_point_factory):
    cp = connection_point_factory()
    fake_image = io.BytesIO(b"fake jpeg content")
    res = client.post(
        f"/api/files/upload?connection_point_id={cp['id']}",
        files={"file": ("test.jpg", fake_image, "image/jpeg")}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["filename"] == "test.jpg"
    assert data["connection_point_id"] == cp["id"]

def test_upload_pdf(client, connection_point_factory):
    cp = connection_point_factory()
    fake_pdf = io.BytesIO(b"%PDF-1.4 fake content")
    res = client.post(
        f"/api/files/upload?connection_point_id={cp['id']}",
        files={"file": ("tegning.pdf", fake_pdf, "application/pdf")}
    )
    assert res.status_code == 200

def test_upload_invalid_type_blocked(client, connection_point_factory):
    cp = connection_point_factory()
    fake_exe = io.BytesIO(b"MZ fake exe")
    res = client.post(
        f"/api/files/upload?connection_point_id={cp['id']}",
        files={"file": ("virus.exe", fake_exe, "application/octet-stream")}
    )
    assert res.status_code == 400

def test_upload_too_large_blocked(client, connection_point_factory):
    cp = connection_point_factory()
    large_file = io.BytesIO(b"x" * (21 * 1024 * 1024))  # 21 MB
    res = client.post(
        f"/api/files/upload?connection_point_id={cp['id']}",
        files={"file": ("stor.jpg", large_file, "image/jpeg")}
    )
    assert res.status_code == 413

def test_delete_file(client, file_factory):
    file = file_factory()
    res = client.delete(f"/api/files/{file['id']}")
    assert res.status_code == 200
    assert client.get(f"/api/files/{file['id']}").status_code == 404

def test_filename_sanitized(client, connection_point_factory):
    cp = connection_point_factory()
    fake_image = io.BytesIO(b"fake jpeg")
    res = client.post(
        f"/api/files/upload?connection_point_id={cp['id']}",
        files={"file": ("../../../etc/passwd.jpg", fake_image, "image/jpeg")}
    )
    assert res.status_code == 200
    assert "../" not in res.json()["filename"]
    assert res.json()["filename"] == "passwd.jpg"
```

```python
# backend/tests/test_changelog.py (utvidet)

def test_changelog_for_circuit(client, circuit_factory):
    circuit = circuit_factory()
    client.post("/api/changelog", json={
        "circuit_id": circuit["id"],
        "changed_by": "Jonas",
        "description": "Byttet sikring"
    })
    res = client.get(f"/api/circuits/{circuit['id']}/changelog")
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["description"] == "Byttet sikring"

def test_changelog_for_connection_point(client, connection_point_factory):
    cp = connection_point_factory()
    client.post("/api/changelog", json={
        "connection_point_id": cp["id"],
        "changed_by": "Elektriker AS",
        "description": "Koblet opp stikk"
    })
    res = client.get(f"/api/connection_points/{cp['id']}/changelog")
    assert res.status_code == 200
    assert len(res.json()) == 1

def test_changelog_newest_first(client, circuit_factory):
    circuit = circuit_factory()
    for i in range(3):
        client.post("/api/changelog", json={
            "circuit_id": circuit["id"],
            "changed_by": "Jonas",
            "description": f"Endring {i}"
        })
    res = client.get(f"/api/circuits/{circuit['id']}/changelog")
    entries = res.json()
    assert entries[0]["description"] == "Endring 2"
    assert entries[2]["description"] == "Endring 0"
```

```python
# Legg til i backend/tests/conftest.py

@pytest.fixture
def connection_point_factory(client, circuit_factory):
    def make(circuit_id=None):
        if circuit_id is None:
            circuit = circuit_factory()
            circuit_id = circuit["id"]
        return client.post(f"/api/circuits/{circuit_id}/connection_points", json={
            "type": "junction_box",
            "location": "Tak stue"
        }).json()
    return make

@pytest.fixture
def file_factory(client, connection_point_factory, tmp_path):
    def make(connection_point_id=None):
        if connection_point_id is None:
            cp = connection_point_factory()
            connection_point_id = cp["id"]
        import io
        fake_image = io.BytesIO(b"fake jpeg content")
        return client.post(
            f"/api/files/upload?connection_point_id={connection_point_id}",
            files={"file": ("test.jpg", fake_image, "image/jpeg")}
        ).json()
    return make
```

---

## Frontend-tester (Vitest)

```javascript
// frontend/src/__tests__/CircuitDetail.test.jsx

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import CircuitDetail from '../pages/CircuitDetail'
import * as api from '../api/client'

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={['/kurs/1']}>
      <Routes>
        <Route path="/kurs/:id" element={children} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>
)

const mockCircuit = {
  id: 1, panel_id: 1, designation: 'B01', name: 'Lys stue',
  room: 'Stue', cable_type: 'NYM-J', cross_section: 1.5,
  conductor_count: 3, length_m: 12.0
}

const mockConnectionPoints = [
  { id: 1, circuit_id: 1, type: 'junction_box', location: 'Tak stue', notes: '' }
]

test('viser kursdetaljer', async () => {
  vi.spyOn(api, 'getCircuit').mockResolvedValue(mockCircuit)
  vi.spyOn(api, 'getConnectionPoints').mockResolvedValue([])
  vi.spyOn(api, 'getChangelog').mockResolvedValue([])
  render(<CircuitDetail />, { wrapper })
  await waitFor(() => screen.getByText('B01'))
  expect(screen.getByText('Lys stue')).toBeInTheDocument()
  expect(screen.getByText('NYM-J')).toBeInTheDocument()
})

test('viser melding når ingen koblingspunkter', async () => {
  vi.spyOn(api, 'getCircuit').mockResolvedValue(mockCircuit)
  vi.spyOn(api, 'getConnectionPoints').mockResolvedValue([])
  vi.spyOn(api, 'getChangelog').mockResolvedValue([])
  render(<CircuitDetail />, { wrapper })
  await waitFor(() => screen.getByText(/ingen koblingspunkter/i))
})

test('viser koblingspunkter', async () => {
  vi.spyOn(api, 'getCircuit').mockResolvedValue(mockCircuit)
  vi.spyOn(api, 'getConnectionPoints').mockResolvedValue(mockConnectionPoints)
  vi.spyOn(api, 'getChangelog').mockResolvedValue([])
  render(<CircuitDetail />, { wrapper })
  await waitFor(() => screen.getByText('Tak stue'))
})

test('skjema validerer påkrevde felt for koblingspunkt', async () => {
  vi.spyOn(api, 'getCircuit').mockResolvedValue(mockCircuit)
  vi.spyOn(api, 'getConnectionPoints').mockResolvedValue([])
  vi.spyOn(api, 'getChangelog').mockResolvedValue([])
  render(<CircuitDetail />, { wrapper })
  await userEvent.click(await screen.findByText(/legg til koblingspunkt/i))
  await userEvent.click(screen.getByText(/lagre/i))
  expect(screen.getByText(/plassering er påkrevd/i)).toBeInTheDocument()
})
```

```javascript
// frontend/src/__tests__/FileUpload.test.jsx

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import FileUpload from '../components/FileUpload'
import * as api from '../api/client'

test('viser feilmelding ved ugyldig filtype', async () => {
  render(<FileUpload connectionPointId={1} onUploaded={() => {}} />)
  const file = new File(['content'], 'virus.exe', { type: 'application/octet-stream' })
  const input = screen.getByTestId('file-input')
  await userEvent.upload(input, file)
  expect(screen.getByText(/filtype ikke støttet/i)).toBeInTheDocument()
})

test('viser feilmelding ved fil over 20 MB', async () => {
  render(<FileUpload connectionPointId={1} onUploaded={() => {}} />)
  const largeContent = new Uint8Array(21 * 1024 * 1024)
  const file = new File([largeContent], 'stor.jpg', { type: 'image/jpeg' })
  const input = screen.getByTestId('file-input')
  await userEvent.upload(input, file)
  expect(screen.getByText(/for stor/i)).toBeInTheDocument()
})

test('kaller onUploaded ved vellykket opplasting', async () => {
  const onUploaded = vi.fn()
  vi.spyOn(api, 'uploadFile').mockResolvedValue({ id: 1, filename: 'test.jpg' })
  render(<FileUpload connectionPointId={1} onUploaded={onUploaded} />)
  const file = new File(['fake jpeg'], 'test.jpg', { type: 'image/jpeg' })
  const input = screen.getByTestId('file-input')
  await userEvent.upload(input, file)
  await waitFor(() => expect(onUploaded).toHaveBeenCalled())
})
```

---

## Kjøre testene

```bash
# Backend (alle faser)
cd backend && pytest tests/ -v

# Frontend (alle faser)
cd frontend && npm run test

# Kun fase 3
cd backend && pytest tests/test_connection_points.py tests/test_files.py tests/test_changelog.py -v
cd frontend && npm run test -- ConnectionPoint FileUpload CircuitDetail
```

---

## Smoketest – Fase 3

```
Start backend and frontend, then perform a smoke test:
- Navigate to an existing circuit
- Add a junction_box connection point with location "Tak stue"
- Upload a JPG image to the connection point
- Verify the image thumbnail appears
- Add a changelog entry: changed_by "Jonas", description "Testet fase 3"
- Verify the entry appears newest-first in the log
- Attempt to delete the connection point — verify 409 (has files)
- Delete the file first, then delete the connection point — verify 200
- Verify changelog PUT and DELETE return 405
Report HTTP status and result for each step.
```

---

## Definition of Done – Fase 3

Fase 3 er ferdig når:
- [ ] Alle backend-tester er grønne (inkl. fase 1 og 2)
- [ ] Alle frontend-tester er grønne (inkl. fase 1 og 2)
- [ ] Alle 8 akseptansekriterier er manuelt verifisert
- [ ] Filoppplasting fungerer med JPG, PNG og PDF
- [ ] Ugyldig filtype og for store filer avvises
- [ ] Path traversal i filnavn blokkeres
- [ ] Endringslogg vises nyeste først
- [ ] Smoketest fullført uten feil
- [ ] Ingen hardkodede norske strenger utenfor `i18n/no.js`
- [ ] Kode pushet til `feature/fase3` og klar for merge
