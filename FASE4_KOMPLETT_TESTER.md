# Tavla – Fase 4 (komplett): Tester og akseptansekriterier

Samlet testplan for Fase 4, 4b og 4c.

---

## Akseptansekriterier

### AC-1: Utstyrsliste på kursside (`/kurs/:id`)
- [ ] Viser alle utstyrselementer tilknyttet kursen
- [ ] Viser type (norsk navn), merke, modell, effekt (W) og kommentar per element
- [ ] Viser melding når ingen utstyr er registrert
- [ ] Fase 3-placeholder er erstattet med ekte innhold

### AC-2: Opprett utstyr
- [ ] "Legg til utstyr"-knapp åpner skjema
- [ ] Type-dropdown viser alle 5 typer med norske navn
- [ ] Ved type `dynalite`: felt "Antall kanaler" pre-fylt med 12
- [ ] Ved type `shelly`: felt "Antall kanaler" pre-fylt med 4
- [ ] Andre typer: felt "Antall kanaler" tomt og valgfritt
- [ ] Nytt utstyr vises umiddelbart uten full reload
- [ ] Skjema validerer at type er valgt

### AC-3: Rediger og slett utstyr
- [ ] Klikk åpner redigeringsskjema pre-fylt
- [ ] Slett med bekreftelsesdialog
- [ ] Utstyr med filer kan ikke slettes uten å slette filer først (409)

### AC-4: Filoppplasting på utstyr
- [ ] Støtter JPG, PNG og PDF (maks 20 MB)
- [ ] Thumbnail for bilder, PDF-ikon for PDF
- [ ] Filer lagres under `/opt/tavla/uploads/equipment/{equipment_id}/`
- [ ] Fil kan kun tilhøre én forelder (equipment eller connection_point, ikke begge)

### AC-5: Utstyr i endringslogg
- [ ] Opprett og slett utstyr logges automatisk på kursen med norsk beskrivelse

### AC-6: Utstyrssammendrag på skapsiden
- [ ] Viser totalt antall utstyrselementer som badge
- [ ] Klikk filtrerer kurslisten til kun kurser med utstyr

### AC-7: Kanalregister
- [ ] Utstyr med kanaler viser kanalregistertabell under utstyrsinformasjonen
- [ ] Kolonner: Nr, Type, Etikett, Last, Watt, Tilknyttet kurs, Kommentar, Rediger
- [ ] Tomme kanaler vises som grå rader med "— ikke koblet —"
- [ ] Utstyr uten kanaler viser ingen kanaltabell

### AC-8: Auto-generering av kanaler
- [ ] Dynalite auto-genererer 12 tomme kanaler ved opprettelse
- [ ] Shelly auto-genererer 4 tomme kanaler ved opprettelse
- [ ] Andre typer: valgfritt antall
- [ ] `channel_count` lagres ikke på utstyret selv

### AC-9: Rediger kanal (inline)
- [ ] Klikk på rad aktiverer inline redigering av alle felt
- [ ] Enter eller klikk utenfor lagrer
- [ ] Escape avbryter uten å lagre
- [ ] Duplikat kanalnummer blokkeres (400)

### AC-10: Kanal — type og effekt
- [ ] `channel_type` vises og redigeres: "Relé (av/på)" eller "Dimmer"
- [ ] Default er "Relé (av/på)"
- [ ] `watt`-felt med W-suffix redigeres per kanal
- [ ] Total watt summeres per utstyr og vises under kanalregisteret
- [ ] Kanaler uten watt telles ikke med i sum

### AC-11: Kanal — tilknyttet kurs
- [ ] Dropdown viser kurser i samme skap
- [ ] Tomt valg er mulig
- [ ] Valgt kurs vises som klikkbar lenke til `/kurs/:id`

### AC-12: Legg til og slett kanal
- [ ] "Legg til kanal"-knapp legger til ny tom rad med neste ledige nummer
- [ ] Ny rad er umiddelbart i redigeringsmodus
- [ ] Slett kanal med bekreftelsesdialog

### AC-13: Ledig modul i skap-mockup
- [ ] "Merk som ledig" i ModuleDialog
- [ ] Ledig modul vises grå med tekst "Ledig" i canvas
- [ ] Ledig modul blokkerer overlapp som vanlig
- [ ] Ledig modul kan ikke ha tilknyttet kurs (400)
- [ ] Ledig modul kan redigeres via kontekstmeny

### AC-14: Ny modultype — Hovedbryter (OV50)
- [ ] Vises i ModuleDialog type-dropdown som "Hovedbryter (OV50)"
- [ ] Farge: antrasitt, CSS-klasse `module-main_switch`
- [ ] Vises med tekst "OV" i canvas
- [ ] Kan ha ampere-verdi
- [ ] Kan ikke ha tilknyttet kurs (400)

### AC-15: Norske tekster
- [ ] Alle UI-tekster fra `i18n/no.js`
- [ ] Utstyrstyper, kanaltypenavnene, "Ledig", "Hovedbryter (OV50)"

---

## Backend-tester (pytest)

### test_equipment.py
```python
def test_create_equipment(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(f"/api/circuits/{circuit['id']}/equipment", json={
        "type": "floor_heating", "brand": "Nexans",
        "model": "DEFHEAT 20", "watt": 1200
    })
    assert res.status_code == 200
    assert res.json()["type"] == "floor_heating"
    assert res.json()["watt"] == 1200

def test_create_equipment_invalid_type(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(f"/api/circuits/{circuit['id']}/equipment", json={"type": "ugyldig"})
    assert res.status_code == 422

def test_create_equipment_type_required(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(f"/api/circuits/{circuit['id']}/equipment", json={"brand": "Nexans"})
    assert res.status_code == 422

def test_get_equipment_empty(client, circuit_factory):
    circuit = circuit_factory()
    res = client.get(f"/api/circuits/{circuit['id']}/equipment")
    assert res.status_code == 200
    assert res.json() == []

def test_update_equipment(client, equipment_factory):
    eq = equipment_factory()
    res = client.put(f"/api/equipment/{eq['id']}", json={**eq, "watt": 2400})
    assert res.status_code == 200
    assert res.json()["watt"] == 2400

def test_delete_equipment(client, equipment_factory):
    eq = equipment_factory()
    res = client.delete(f"/api/equipment/{eq['id']}")
    assert res.status_code == 200

def test_delete_equipment_with_files_blocked(client, equipment_file_factory):
    file = equipment_file_factory()
    res = client.delete(f"/api/equipment/{file['equipment_id']}")
    assert res.status_code in [400, 409]

def test_equipment_changelog_on_create(client, circuit_factory):
    circuit = circuit_factory()
    client.post(f"/api/circuits/{circuit['id']}/equipment", json={"type": "floor_heating"})
    res = client.get(f"/api/circuits/{circuit['id']}/changelog")
    assert len(res.json()) >= 1

def test_equipment_invalid_circuit(client):
    res = client.post("/api/circuits/999/equipment", json={"type": "boiler"})
    assert res.status_code == 404

def test_file_must_have_exactly_one_parent(client, equipment_factory, connection_point_factory):
    import io
    eq = equipment_factory()
    cp = connection_point_factory()
    res = client.post(
        f"/api/files/upload?equipment_id={eq['id']}&connection_point_id={cp['id']}",
        files={"file": ("test.jpg", io.BytesIO(b"fake"), "image/jpeg")}
    )
    assert res.status_code == 400
```

### test_channels.py
```python
def test_create_channel(client, equipment_factory):
    eq = equipment_factory()
    res = client.post(f"/api/equipment/{eq['id']}/channels", json={
        "number": 1, "label": "Lys stue", "load": "6x LED"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["number"] == 1
    assert data["channel_type"] == "relay"
    assert data["watt"] is None

def test_channel_type_dimmer(client, equipment_factory):
    eq = equipment_factory()
    res = client.post(f"/api/equipment/{eq['id']}/channels", json={
        "number": 1, "channel_type": "dimmer"
    })
    assert res.status_code == 200
    assert res.json()["channel_type"] == "dimmer"

def test_channel_invalid_type(client, equipment_factory):
    eq = equipment_factory()
    res = client.post(f"/api/equipment/{eq['id']}/channels", json={
        "number": 1, "channel_type": "ugyldig"
    })
    assert res.status_code == 422

def test_channel_watt(client, equipment_factory):
    eq = equipment_factory()
    res = client.post(f"/api/equipment/{eq['id']}/channels", json={
        "number": 1, "watt": 1500
    })
    assert res.status_code == 200
    assert res.json()["watt"] == 1500

def test_auto_generate_12_channels_dynalite(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(f"/api/circuits/{circuit['id']}/equipment", json={
        "type": "dynalite", "model": "DDRC1220FR-GL", "channel_count": 12
    })
    eq_id = res.json()["id"]
    channels = client.get(f"/api/equipment/{eq_id}/channels").json()
    assert len(channels) == 12
    assert channels[0]["number"] == 1
    assert channels[11]["number"] == 12

def test_channel_count_not_stored(client, circuit_factory):
    circuit = circuit_factory()
    res = client.post(f"/api/circuits/{circuit['id']}/equipment", json={
        "type": "dynalite", "channel_count": 12
    })
    assert "channel_count" not in res.json()

def test_channels_sorted_by_number(client, equipment_factory):
    eq = equipment_factory()
    for n in [3, 1, 2]:
        client.post(f"/api/equipment/{eq['id']}/channels", json={"number": n})
    channels = client.get(f"/api/equipment/{eq['id']}/channels").json()
    assert [c["number"] for c in channels] == [1, 2, 3]

def test_duplicate_channel_number_blocked(client, equipment_factory):
    eq = equipment_factory()
    client.post(f"/api/equipment/{eq['id']}/channels", json={"number": 1})
    res = client.post(f"/api/equipment/{eq['id']}/channels", json={"number": 1})
    assert res.status_code == 400

def test_update_channel(client, channel_factory):
    ch = channel_factory()
    res = client.put(f"/api/channels/{ch['id']}", json={
        **ch, "label": "Lys gang", "channel_type": "dimmer", "watt": 750
    })
    assert res.status_code == 200
    assert res.json()["label"] == "Lys gang"
    assert res.json()["channel_type"] == "dimmer"
    assert res.json()["watt"] == 750

def test_update_channel_invalid_circuit(client, channel_factory):
    ch = channel_factory()
    res = client.put(f"/api/channels/{ch['id']}", json={**ch, "circuit_id": 99999})
    assert res.status_code == 404

def test_delete_channel(client, channel_factory):
    ch = channel_factory()
    res = client.delete(f"/api/channels/{ch['id']}")
    assert res.status_code == 200
```

### test_modules_4c.py
```python
def test_module_is_vacant_default_false(client, panel_factory):
    panel = panel_factory()
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1, "type": "breaker", "label": "B01"
    })
    assert res.json()["is_vacant"] == False

def test_create_vacant_module(client, panel_factory):
    panel = panel_factory()
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 2,
        "type": "breaker", "is_vacant": True
    })
    assert res.status_code == 200
    assert res.json()["is_vacant"] == True

def test_vacant_module_cannot_have_circuit(client, panel_factory, circuit_factory):
    panel = panel_factory()
    circuit = circuit_factory(panel_id=panel["id"])
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1,
        "type": "breaker", "is_vacant": True,
        "circuit_id": circuit["id"]
    })
    assert res.status_code == 400

def test_create_main_switch_module(client, panel_factory):
    panel = panel_factory()
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 3,
        "type": "main_switch", "ampere": 50, "label": "OV50"
    })
    assert res.status_code == 200
    assert res.json()["type"] == "main_switch"

def test_main_switch_cannot_have_circuit(client, panel_factory, circuit_factory):
    panel = panel_factory()
    circuit = circuit_factory(panel_id=panel["id"])
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 3,
        "type": "main_switch", "circuit_id": circuit["id"]
    })
    assert res.status_code == 400
```

---

## Frontend-tester (Vitest)

### EquipmentList
```javascript
test('viser melding når ingen utstyr', async () => {
  vi.spyOn(api, 'getEquipment').mockResolvedValue([])
  render(<EquipmentList circuitId={1} />, { wrapper })
  await waitFor(() => screen.getByText(/ingen utstyr/i))
})

test('viser alle 5 utstyrstyper i dropdown', async () => {
  vi.spyOn(api, 'getEquipment').mockResolvedValue([])
  render(<EquipmentList circuitId={1} />, { wrapper })
  await userEvent.click(await screen.findByText(/legg til utstyr/i))
  const options = Array.from(
    screen.getByLabelText(/type/i).querySelectorAll('option')
  ).map(o => o.textContent)
  expect(options).toContain('Varmekabler')
  expect(options).toContain('Elbillader')
  expect(options).toContain('Varmepumpe')
  expect(options).toContain('Varmtvannsbereder')
  expect(options).toContain('Annet')
})

test('dynalite pre-fyller antall kanaler med 12', async () => {
  vi.spyOn(api, 'getEquipment').mockResolvedValue([])
  render(<EquipmentList circuitId={1} />, { wrapper })
  await userEvent.click(await screen.findByText(/legg til utstyr/i))
  fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'dynalite' } })
  await waitFor(() => expect(screen.getByLabelText(/antall kanaler/i)).toHaveValue(12))
})

test('shelly pre-fyller antall kanaler med 4', async () => {
  vi.spyOn(api, 'getEquipment').mockResolvedValue([])
  render(<EquipmentList circuitId={1} />, { wrapper })
  await userEvent.click(await screen.findByText(/legg til utstyr/i))
  fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'shelly' } })
  await waitFor(() => expect(screen.getByLabelText(/antall kanaler/i)).toHaveValue(4))
})

test('skjema validerer at type er valgt', async () => {
  vi.spyOn(api, 'getEquipment').mockResolvedValue([])
  render(<EquipmentList circuitId={1} />, { wrapper })
  await userEvent.click(await screen.findByText(/legg til utstyr/i))
  await userEvent.click(screen.getByText(/lagre/i))
  expect(screen.getByText(/type er påkrevd/i)).toBeInTheDocument()
})
```

### ChannelRegister
```javascript
test('viser kanalregistertabell', async () => {
  vi.spyOn(api, 'getChannels').mockResolvedValue(mockChannels)
  render(<ChannelRegister equipmentId={1} circuits={mockCircuits} />, { wrapper })
  const rows = await screen.findAllByTestId('channel-row')
  expect(rows).toHaveLength(3)
})

test('viser ikke koblet for tomme kanaler', async () => {
  vi.spyOn(api, 'getChannels').mockResolvedValue([
    { id: 1, equipment_id: 1, number: 1, label: '', load: '',
      channel_type: 'relay', watt: null, circuit_id: null }
  ])
  render(<ChannelRegister equipmentId={1} circuits={[]} />, { wrapper })
  await waitFor(() => screen.getByText(/ikke koblet/i))
})

test('viser dimmer i tabell', async () => {
  vi.spyOn(api, 'getChannels').mockResolvedValue([
    { id: 1, equipment_id: 1, number: 1, label: 'Lys',
      channel_type: 'dimmer', watt: 750, circuit_id: null }
  ])
  render(<ChannelRegister equipmentId={1} circuits={[]} />, { wrapper })
  await waitFor(() => screen.getByText('Dimmer'))
  expect(screen.getByText('750 W')).toBeInTheDocument()
})

test('viser total effekt', async () => {
  vi.spyOn(api, 'getChannels').mockResolvedValue([
    { id: 1, equipment_id: 1, number: 1, watt: 750, channel_type: 'relay', label: 'A' },
    { id: 2, equipment_id: 1, number: 2, watt: 750, channel_type: 'relay', label: 'B' },
    { id: 3, equipment_id: 1, number: 3, watt: null, channel_type: 'relay', label: 'C' },
  ])
  render(<ChannelRegister equipmentId={1} circuits={[]} />, { wrapper })
  await waitFor(() => screen.getByText(/total/i))
  expect(screen.getByText(/1500 W/i)).toBeInTheDocument()
})

test('klikk aktiverer inline redigering', async () => {
  vi.spyOn(api, 'getChannels').mockResolvedValue([
    { id: 1, equipment_id: 1, number: 1, label: 'Lys stue',
      channel_type: 'relay', watt: null, circuit_id: null }
  ])
  render(<ChannelRegister equipmentId={1} circuits={[]} />, { wrapper })
  await userEvent.click(await screen.findByTestId('channel-row'))
  expect(screen.getByDisplayValue('Lys stue')).toBeInTheDocument()
})

test('escape avbryter redigering', async () => {
  vi.spyOn(api, 'getChannels').mockResolvedValue([
    { id: 1, equipment_id: 1, number: 1, label: 'Lys stue',
      channel_type: 'relay', watt: null, circuit_id: null }
  ])
  render(<ChannelRegister equipmentId={1} circuits={[]} />, { wrapper })
  await userEvent.click(await screen.findByTestId('channel-row'))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.getByText('Lys stue')).toBeInTheDocument()
  expect(screen.queryByDisplayValue('Lys stue')).not.toBeInTheDocument()
})

test('kurslenkje er klikkbar', async () => {
  vi.spyOn(api, 'getChannels').mockResolvedValue([
    { id: 1, equipment_id: 1, number: 1, label: 'Lys',
      channel_type: 'relay', watt: null, circuit_id: 1 }
  ])
  render(<ChannelRegister equipmentId={1} circuits={[{ id: 1, designation: 'B01', name: 'Lys stue' }]} />, { wrapper })
  await waitFor(() => screen.getByRole('link', { name: /B01/i }))
  expect(screen.getByRole('link', { name: /B01/i })).toHaveAttribute('href', '/kurs/1')
})
```

### PanelMockup (4c)
```javascript
test('ledig modul vises med tekst Ledig', async () => {
  vi.spyOn(api, 'getPanelModules').mockResolvedValue([
    { id: 1, row: 0, position: 0, width: 2, type: 'breaker',
      label: '', is_vacant: true, circuit_id: null }
  ])
  render(<PanelCanvas panel={mockPanel} />, { wrapper })
  await waitFor(() => screen.getByText('Ledig'))
  expect(screen.getByTestId('module-1')).toHaveClass('module-vacant')
})

test('main_switch vises i type-dropdown', async () => {
  render(<ModuleDialog open={true} onClose={() => {}} onSave={() => {}} circuits={[]} />, { wrapper })
  const options = Array.from(
    screen.getByLabelText(/type/i).querySelectorAll('option')
  ).map(o => o.textContent)
  expect(options).toContain('Hovedbryter (OV50)')
})
```

---

## Kjøre testene

```bash
# Backend — alle fase 4-tester
cd backend && pytest tests/test_equipment.py tests/test_channels.py tests/test_modules_4c.py -v

# Backend — alle faser
cd backend && pytest tests/ -v

# Frontend — fase 4
cd frontend && npm run test -- EquipmentList ChannelRegister PanelMockup

# Frontend — alle faser
cd frontend && npm run test
```

---

## Komplett smoketest — Fase 4

```
Start backend and frontend, then perform a complete Phase 4 smoke test:

UTSTYR:
- Navigate to an existing circuit
- Add floor_heating: brand "Nexans", model "DEFHEAT 20", watt 1200
- Verify "Varmekabler" appears with correct details
- Upload a JPG to the equipment — verify thumbnail
- Edit watt to 2400 — verify change
- Attempt to delete equipment with file — verify 409
- Delete file, then delete equipment — verify success
- Verify changelog shows create and delete entries

DYNALITE MED KANALER:
- Add dynalite equipment: model "DDRC1220FR-GL", channel_count 12
- Verify 12 empty channel rows appear
- Edit channel 1: label "Lys stue gruppe A", load "6x LED 9W", channel_type "dimmer", watt 750
- Edit channel 2: label "Varmekabel hall", channel_type "relay", watt 1500
- Verify total watt shows 2250 W
- Link channel 3 to an existing circuit — verify clickable link appears
- Add manual channel via "Legg til kanal" — verify number 13
- Delete channel 13 — verify success
- Attempt duplicate channel number — verify 400

LEDIG MODUL:
- Open panel mockup
- Place new module, check "Merk som ledig", width 2
- Verify gray "Ledig" block in canvas
- Attempt to assign circuit to it — verify 400

HOVEDBRYTER:
- Place new module: type "Hovedbryter (OV50)", width 3, ampere 50
- Verify antrasitt color and "OV" text in canvas
- Attempt to assign circuit — verify 400

Report HTTP status and result for each step.
```

---

## Definition of Done — Fase 4 (komplett)

Fase 4 er ferdig når:
- [ ] Alle backend-tester grønne (inkl. fase 1–3)
- [ ] Alle frontend-tester grønne (inkl. fase 1–3)
- [ ] Alle 15 akseptansekriterier manuelt verifisert
- [ ] Dynalite auto-genererer 12 kanaler, Shelly 4
- [ ] Dimmer/relé og watt vises og summeres korrekt
- [ ] Ledig modul er visuelt tydelig i skap-mockup
- [ ] Hovedbryter (OV50) fungerer som modultype
- [ ] Alembic-migrering kjørt — ingen tap av eksisterende data
- [ ] Komplett smoketest fullført uten feil
- [ ] Ingen hardkodede norske strenger utenfor `i18n/no.js`
- [ ] Kode pushet til `feature/fase4` og klar for merge
