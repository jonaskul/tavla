# Tavla – Fase 4b: Kanaldokumentasjon

## Bakgrunn
Utstyr med flere utganger (Dynalite relékontrollere, Shelly multi-channel,
styringspaneler o.l.) trenger et kanalregister der hver utgang kan dokumenteres
med tilkoblet last og eventuell kurskoblings.

---

## Akseptansekriterier

### AC-1: Kanalregister vises på utstyr
- [ ] Utstyr med kanaler viser en kanalregistertabell under utstyrsinformasjonen
- [ ] Kolonner: Nr, Etikett, Last, Tilknyttet kurs, Kommentar, Rediger
- [ ] Tomme kanaler vises som grå rader med teksten "— ikke koblet —"
- [ ] Utstyr uten kanaler viser ingen kanaltabell

### AC-2: Auto-generering av kanaler ved opprettelse
- [ ] Ved opprettelse av utstyr av type `dynalite`: vises felt "Antall kanaler" pre-fylt med 12
- [ ] Ved opprettelse av utstyr av type `shelly`: vises felt "Antall kanaler" pre-fylt med 4
- [ ] Andre utstyrstyper: vises felt "Antall kanaler" (tomt, valgfritt)
- [ ] Ved lagre med antall kanaler > 0: genereres tomme kanaler nummerert 1–N automatisk
- [ ] Kanalene er umiddelbart synlige i kanalregisteret etter opprettelse

### AC-3: Rediger kanal
- [ ] Klikk på rad aktiverer inline redigering av alle felt
- [ ] Enter eller klikk utenfor lagrer endringen
- [ ] Escape avbryter redigering uten å lagre
- [ ] Endring sendes som PUT til `/api/channels/{id}`
- [ ] Oppdatert verdi vises umiddelbart

### AC-4: Tilknyttet kurs
- [ ] Dropdown viser alle kurser i samme skap som utstyrets kurs
- [ ] Tomt valg er mulig (kanal ikke koblet til kurs)
- [ ] Valgt kurs vises som klikkbar lenke til `/kurs/:id`

### AC-5: Legg til kanal manuelt
- [ ] "Legg til kanal"-knapp legger til ny tom rad nederst
- [ ] Ny kanal får neste ledige nummer automatisk
- [ ] Ny rad er umiddelbart i redigeringsmodus

### AC-6: Slett kanal
- [ ] Slett-knapp per rad med bekreftelsesdialog
- [ ] Kanal slettes og tabell oppdateres umiddelbart

### AC-7: Norske tekster
- [ ] Alle tekster hentes fra `i18n/no.js`
- [ ] "— ikke koblet —" for tomme kanaler
- [ ] Feltlabels: Nr, Etikett, Last, Tilknyttet kurs, Kommentar

---

## Backend-tester (pytest)

```python
# backend/tests/test_channels.py

def test_create_channel(client, equipment_factory):
    eq = equipment_factory()
    res = client.post(f"/api/equipment/{eq['id']}/channels", json={
        "number": 1,
        "label": "Lys stue gruppe A",
        "load": "6x LED downlight",
        "notes": ""
    })
    assert res.status_code == 200
    data = res.json()
    assert data["number"] == 1
    assert data["label"] == "Lys stue gruppe A"
    assert data["equipment_id"] == eq["id"]

def test_auto_generate_channels_on_equipment_create(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(f"/api/circuits/{circuit['id']}/equipment", json={
        "type": "dynalite",
        "brand": "Signify",
        "model": "DDRC1220FR-GL",
        "channel_count": 12
    })
    assert res.status_code == 200
    eq_id = res.json()["id"]

    channels = client.get(f"/api/equipment/{eq_id}/channels").json()
    assert len(channels) == 12
    assert channels[0]["number"] == 1
    assert channels[11]["number"] == 12
    assert all(c["label"] is None or c["label"] == "" for c in channels)

def test_auto_generate_zero_channels(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(f"/api/circuits/{circuit['id']}/equipment", json={
        "type": "floor_heating",
        "channel_count": 0
    })
    assert res.status_code == 200
    eq_id = res.json()["id"]
    channels = client.get(f"/api/equipment/{eq_id}/channels").json()
    assert len(channels) == 0

def test_channel_count_not_stored_on_equipment(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(f"/api/circuits/{circuit['id']}/equipment", json={
        "type": "dynalite",
        "channel_count": 12
    })
    eq = res.json()
    assert "channel_count" not in eq

def test_get_channels_for_equipment(client, equipment_factory):
    eq = equipment_factory()
    for i in range(1, 4):
        client.post(f"/api/equipment/{eq['id']}/channels", json={"number": i})
    res = client.get(f"/api/equipment/{eq['id']}/channels")
    assert res.status_code == 200
    assert len(res.json()) == 3

def test_get_channels_sorted_by_number(client, equipment_factory):
    eq = equipment_factory()
    for n in [3, 1, 2]:
        client.post(f"/api/equipment/{eq['id']}/channels", json={"number": n})
    channels = client.get(f"/api/equipment/{eq['id']}/channels").json()
    numbers = [c["number"] for c in channels]
    assert numbers == sorted(numbers)

def test_update_channel(client, channel_factory):
    ch = channel_factory()
    res = client.put(f"/api/channels/{ch['id']}", json={
        **ch,
        "label": "Lys gang",
        "load": "3x LED 9W"
    })
    assert res.status_code == 200
    assert res.json()["label"] == "Lys gang"
    assert res.json()["load"] == "3x LED 9W"

def test_update_channel_with_circuit(client, channel_factory, circuit_factory):
    ch = channel_factory()
    circuit = circuit_factory()
    res = client.put(f"/api/channels/{ch['id']}", json={
        **ch, "circuit_id": circuit["id"]
    })
    assert res.status_code == 200
    assert res.json()["circuit_id"] == circuit["id"]

def test_update_channel_invalid_circuit(client, channel_factory):
    ch = channel_factory()
    res = client.put(f"/api/channels/{ch['id']}", json={
        **ch, "circuit_id": 99999
    })
    assert res.status_code == 404

def test_delete_channel(client, channel_factory):
    ch = channel_factory()
    res = client.delete(f"/api/channels/{ch['id']}")
    assert res.status_code == 200

def test_duplicate_channel_number_blocked(client, equipment_factory):
    eq = equipment_factory()
    client.post(f"/api/equipment/{eq['id']}/channels", json={"number": 1})
    res = client.post(f"/api/equipment/{eq['id']}/channels", json={"number": 1})
    assert res.status_code == 400

def test_channel_not_found(client):
    res = client.get("/api/channels/99999")
    assert res.status_code == 404

def test_equipment_not_found_for_channels(client):
    res = client.get("/api/equipment/99999/channels")
    assert res.status_code == 404
```

```python
# Legg til i backend/tests/conftest.py

@pytest.fixture
def channel_factory(client, equipment_factory):
    def make(equipment_id=None, number=1, label=None, load=None):
        if equipment_id is None:
            eq = equipment_factory()
            equipment_id = eq["id"]
        return client.post(f"/api/equipment/{equipment_id}/channels", json={
            "number": number,
            "label": label or "",
            "load": load or ""
        }).json()
    return make
```

---

## Frontend-tester (Vitest)

```javascript
// frontend/src/__tests__/ChannelRegister.test.jsx

import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import ChannelRegister from '../components/ChannelRegister'
import * as api from '../api/client'

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
)

const mockChannels = [
  { id: 1, equipment_id: 1, number: 1, label: 'Lys stue', load: '6x LED', circuit_id: null, notes: '' },
  { id: 2, equipment_id: 1, number: 2, label: '', load: '', circuit_id: null, notes: '' },
  { id: 3, equipment_id: 1, number: 3, label: 'Lys gang', load: '3x LED', circuit_id: 1, notes: '' },
]

const mockCircuits = [
  { id: 1, designation: 'B01', name: 'Lys stue' },
  { id: 2, designation: 'B02', name: 'Stikk stue' },
]

test('viser kanalregistertabell med riktig antall rader', async () => {
  vi.spyOn(api, 'getChannels').mockResolvedValue(mockChannels)
  render(<ChannelRegister equipmentId={1} circuits={mockCircuits} />, { wrapper })
  await waitFor(() => screen.getAllByRole('row'))
  const rows = screen.getAllByTestId('channel-row')
  expect(rows).toHaveLength(3)
})

test('viser "ikke koblet" for tomme kanaler', async () => {
  vi.spyOn(api, 'getChannels').mockResolvedValue(mockChannels)
  render(<ChannelRegister equipmentId={1} circuits={mockCircuits} />, { wrapper })
  await waitFor(() => screen.getByText(/ikke koblet/i))
})

test('viser lenke til kurs for kanal med circuit_id', async () => {
  vi.spyOn(api, 'getChannels').mockResolvedValue(mockChannels)
  render(<ChannelRegister equipmentId={1} circuits={mockCircuits} />, { wrapper })
  await waitFor(() => screen.getByText('B01'))
  const link = screen.getByRole('link', { name: /B01/i })
  expect(link).toHaveAttribute('href', '/kurs/1')
})

test('klikk på rad aktiverer inline redigering', async () => {
  vi.spyOn(api, 'getChannels').mockResolvedValue(mockChannels)
  render(<ChannelRegister equipmentId={1} circuits={mockCircuits} />, { wrapper })
  await waitFor(() => screen.getByText('Lys stue'))
  await userEvent.click(screen.getAllByTestId('channel-row')[0])
  expect(screen.getByDisplayValue('Lys stue')).toBeInTheDocument()
})

test('escape avbryter redigering', async () => {
  vi.spyOn(api, 'getChannels').mockResolvedValue(mockChannels)
  render(<ChannelRegister equipmentId={1} circuits={mockCircuits} />, { wrapper })
  await waitFor(() => screen.getByText('Lys stue'))
  await userEvent.click(screen.getAllByTestId('channel-row')[0])
  await userEvent.type(screen.getByDisplayValue('Lys stue'), 'endret')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.getByText('Lys stue')).toBeInTheDocument()
  expect(screen.queryByDisplayValue('Lys stuendret')).not.toBeInTheDocument()
})

test('legg til kanal gir ny rad i redigeringsmodus', async () => {
  vi.spyOn(api, 'getChannels').mockResolvedValue(mockChannels)
  vi.spyOn(api, 'createChannel').mockResolvedValue({
    id: 4, equipment_id: 1, number: 4, label: '', load: '', circuit_id: null, notes: ''
  })
  render(<ChannelRegister equipmentId={1} circuits={mockCircuits} />, { wrapper })
  await waitFor(() => screen.getByText(/legg til kanal/i))
  await userEvent.click(screen.getByText(/legg til kanal/i))
  await waitFor(() => screen.getAllByTestId('channel-row'))
  expect(screen.getAllByTestId('channel-row')).toHaveLength(4)
})

test('dynalite viser antall kanaler pre-fylt med 12 i utstyrsskjema', async () => {
  const { render: renderForm } = await import('../components/EquipmentForm')
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <EquipmentForm circuitId={1} onSave={() => {}} onCancel={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  )
  fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'dynalite' } })
  await waitFor(() => screen.getByLabelText(/antall kanaler/i))
  expect(screen.getByLabelText(/antall kanaler/i)).toHaveValue(12)
})

test('shelly viser antall kanaler pre-fylt med 4', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <EquipmentForm circuitId={1} onSave={() => {}} onCancel={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  )
  fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'shelly' } })
  await waitFor(() => screen.getByLabelText(/antall kanaler/i))
  expect(screen.getByLabelText(/antall kanaler/i)).toHaveValue(4)
})
```

---

## Kjøre testene

```bash
# Backend
cd backend && pytest tests/test_channels.py -v

# Frontend
cd frontend && npm run test -- ChannelRegister
```

---

## Smoketest – Fase 4b

```
Start backend and frontend, then perform a smoke test of channel functionality:
- Navigate to an existing circuit
- Add Dynalite equipment: type "dynalite", model "DDRC1220FR-GL", channel_count 12
- Verify 12 empty channel rows appear in the channel register
- Click channel 1 row and fill in: label "Lys stue gruppe A", load "6x LED downlight 9W"
- Press Enter — verify the row is saved and exits edit mode
- Click channel 2 row, start editing, press Escape — verify original values restored
- Link channel 3 to an existing circuit via the dropdown
- Verify the circuit appears as a clickable link
- Add a manual channel via "Legg til kanal" — verify it gets number 13
- Delete channel 13 with confirmation
- Verify duplicate channel number (create two channels with number 1) returns 400
Report HTTP status and result for each step.
```

---

## Definition of Done – Fase 4b

Fase 4b er ferdig når:
- [ ] Alle backend-tester er grønne (inkl. fase 1–4)
- [ ] Alle frontend-tester er grønne (inkl. fase 1–4)
- [ ] Alle 7 akseptansekriterier er manuelt verifisert
- [ ] Dynalite-utstyr auto-genererer 12 kanaler
- [ ] Shelly-utstyr auto-genererer 4 kanaler
- [ ] Inline redigering fungerer med Enter og Escape
- [ ] Kanalkoblingen til kurs vises som klikkbar lenke
- [ ] Duplikat kanalnummer blokkeres med 400
- [ ] Smoketest fullført uten feil
- [ ] Kode pushet til `feature/fase4` og klar for merge
