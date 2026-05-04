# Tavla – Fase 4c: Manglende felter basert på virkelighet

## Bakgrunn
Gjennomgang av eksisterende kursoversikt avdekket hull mellom hva PDF-dokumentasjon
inneholder og hva Tavla støtter. Denne fasen tetter de viktigste hullene.

---

## Endringer

### 1. Channel — bryter/dimmer og watt
- Nytt felt `channel_type`: `relay` | `dimmer` (default: `relay`)
- Nytt felt `watt` (int, nullable) — effekt for lasten på kanalen

### 2. Module — ledig-status
- Nytt felt `is_vacant` (bool, default: `false`)
- Ledig modul vises visuelt annerledes i skap-mockup (grå med tekst "Ledig")
- Ledig modul kan ikke kobles til kurs

### 3. Module — ny type: hovedbryter
- Ny modultype `main_switch` (OV50/hovedbryter)
- Vises i ModuleDialog som "Hovedbryter (OV50)"
- Farge: mørk grå / antrasitt

---

## Akseptansekriterier

### AC-1: Kanal — bryter/dimmer
- [ ] `channel_type`-felt vises i inline redigering av kanal
- [ ] Valg: "Relé (av/på)" og "Dimmer"
- [ ] Default er "Relé (av/på)"
- [ ] Visning i kanalregistertabell som ikon eller tekst

### AC-2: Kanal — watt
- [ ] `watt`-felt vises i inline redigering av kanal
- [ ] Numerisk input med enhet "W" vist til høyre
- [ ] Vises i kanalregistertabell (tomt hvis ikke satt)
- [ ] Kanaler med watt-verdi summeres per utstyr og vises som total effekt

### AC-3: Modul — ledig-status
- [ ] "Merk som ledig"-alternativ i ModuleDialog
- [ ] Ledig modul vises i skap-canvas som grå med tekst "Ledig"
- [ ] Ledig modul er ikke klikkbar for ny plassering (opptatt slot)
- [ ] Ledig modul kan redigeres (høyreklikk/kontekstmeny)
- [ ] Ledig modul kan ikke ha tilknyttet kurs

### AC-4: Ny modultype — Hovedbryter
- [ ] "Hovedbryter (OV50)" vises i type-dropdown i ModuleDialog
- [ ] Farge: antrasitt (#374151 eller tilsvarende)
- [ ] Vises med tekst "OV" i modulblokken
- [ ] Kan ha ampere-verdi (f.eks. 50A)
- [ ] Kan ikke kobles til kurs (kun fysisk komponent)

### AC-5: Norske tekster
- [ ] Alle nye felter og typer har norske labels i `i18n/no.js`
- [ ] "Relé (av/på)" og "Dimmer" for channel_type
- [ ] "Ledig" for vacant modules
- [ ] "Hovedbryter (OV50)" for main_switch

---

## Backend-tester (pytest)

```python
# backend/tests/test_channels_4c.py

def test_channel_type_default_relay(client, equipment_factory):
    eq = equipment_factory()
    res = client.post(f"/api/equipment/{eq['id']}/channels", json={
        "number": 1,
        "label": "Lys stue"
    })
    assert res.status_code == 200
    assert res.json()["channel_type"] == "relay"

def test_channel_type_dimmer(client, equipment_factory):
    eq = equipment_factory()
    res = client.post(f"/api/equipment/{eq['id']}/channels", json={
        "number": 1,
        "channel_type": "dimmer",
        "label": "Lys stue"
    })
    assert res.status_code == 200
    assert res.json()["channel_type"] == "dimmer"

def test_channel_invalid_type(client, equipment_factory):
    eq = equipment_factory()
    res = client.post(f"/api/equipment/{eq['id']}/channels", json={
        "number": 1,
        "channel_type": "ugyldig"
    })
    assert res.status_code == 422

def test_channel_watt(client, equipment_factory):
    eq = equipment_factory()
    res = client.post(f"/api/equipment/{eq['id']}/channels", json={
        "number": 1,
        "watt": 1500,
        "label": "Varmekabel hall"
    })
    assert res.status_code == 200
    assert res.json()["watt"] == 1500

def test_channel_watt_nullable(client, equipment_factory):
    eq = equipment_factory()
    res = client.post(f"/api/equipment/{eq['id']}/channels", json={
        "number": 1
    })
    assert res.status_code == 200
    assert res.json()["watt"] is None

def test_update_channel_type_and_watt(client, channel_factory):
    ch = channel_factory()
    res = client.put(f"/api/channels/{ch['id']}", json={
        **ch,
        "channel_type": "dimmer",
        "watt": 750
    })
    assert res.status_code == 200
    assert res.json()["channel_type"] == "dimmer"
    assert res.json()["watt"] == 750
```

```python
# backend/tests/test_modules_4c.py

def test_module_is_vacant_default_false(client, panel_factory):
    panel = panel_factory()
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1,
        "type": "breaker", "label": "B01"
    })
    assert res.status_code == 200
    assert res.json()["is_vacant"] == False

def test_create_vacant_module(client, panel_factory):
    panel = panel_factory()
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 2,
        "type": "breaker", "label": "Ledig",
        "is_vacant": True
    })
    assert res.status_code == 200
    assert res.json()["is_vacant"] == True

def test_vacant_module_cannot_have_circuit(client, panel_factory, circuit_factory):
    panel = panel_factory()
    circuit = circuit_factory(panel_id=panel["id"])
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 1,
        "type": "breaker", "label": "Ledig",
        "is_vacant": True,
        "circuit_id": circuit["id"]
    })
    assert res.status_code == 400

def test_mark_existing_module_as_vacant(client, module_factory):
    module = module_factory()
    res = client.put(f"/api/modules/{module['id']}", json={
        **module, "is_vacant": True, "circuit_id": None
    })
    assert res.status_code == 200
    assert res.json()["is_vacant"] == True

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
        "type": "main_switch", "label": "OV50",
        "circuit_id": circuit["id"]
    })
    assert res.status_code == 400
```

---

## Frontend-tester (Vitest)

```javascript
// frontend/src/__tests__/ChannelRegister4c.test.jsx

test('viser channel_type som tekst i tabell', async () => {
  const channels = [
    { id: 1, equipment_id: 1, number: 1, label: 'Lys', channel_type: 'dimmer', watt: 750, circuit_id: null }
  ]
  vi.spyOn(api, 'getChannels').mockResolvedValue(channels)
  render(<ChannelRegister equipmentId={1} circuits={[]} />, { wrapper })
  await waitFor(() => screen.getByText('Dimmer'))
})

test('viser watt i tabell', async () => {
  const channels = [
    { id: 1, equipment_id: 1, number: 1, label: 'Varmekabel', channel_type: 'relay', watt: 1500, circuit_id: null }
  ]
  vi.spyOn(api, 'getChannels').mockResolvedValue(channels)
  render(<ChannelRegister equipmentId={1} circuits={[]} />, { wrapper })
  await waitFor(() => screen.getByText('1500 W'))
})

test('viser total effekt for utstyr', async () => {
  const channels = [
    { id: 1, equipment_id: 1, number: 1, watt: 750, channel_type: 'relay', label: 'A' },
    { id: 2, equipment_id: 1, number: 2, watt: 750, channel_type: 'relay', label: 'B' },
    { id: 3, equipment_id: 1, number: 3, watt: null, channel_type: 'relay', label: 'C' },
  ]
  vi.spyOn(api, 'getChannels').mockResolvedValue(channels)
  render(<ChannelRegister equipmentId={1} circuits={[]} />, { wrapper })
  await waitFor(() => screen.getByText(/total/i))
  expect(screen.getByText(/1500 W/i)).toBeInTheDocument()
})
```

```javascript
// frontend/src/__tests__/PanelMockup4c.test.jsx

test('ledig modul vises med tekst "Ledig"', async () => {
  const modules = [
    { id: 1, row: 0, position: 0, width: 2, type: 'breaker',
      label: 'Ledig', is_vacant: true, circuit_id: null }
  ]
  vi.spyOn(api, 'getPanelModules').mockResolvedValue(modules)
  render(<PanelCanvas panel={mockPanel} />, { wrapper })
  await waitFor(() => screen.getByText('Ledig'))
  expect(screen.getByTestId('module-1')).toHaveClass('module-vacant')
})

test('main_switch modul vises med antrasitt farge', async () => {
  const modules = [
    { id: 1, row: 0, position: 0, width: 3, type: 'main_switch',
      ampere: 50, label: 'OV50', is_vacant: false, circuit_id: null }
  ]
  vi.spyOn(api, 'getPanelModules').mockResolvedValue(modules)
  render(<PanelCanvas panel={mockPanel} />, { wrapper })
  await waitFor(() => screen.getByTestId('module-1'))
  expect(screen.getByTestId('module-1')).toHaveClass('module-main_switch')
})

test('ModuleDialog viser Hovedbryter i type-dropdown', async () => {
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
# Backend
cd backend && pytest tests/test_channels_4c.py tests/test_modules_4c.py -v

# Frontend
cd frontend && npm run test -- ChannelRegister4c PanelMockup4c
```

---

## Smoketest – Fase 4c

```
Start backend and frontend, then smoke test Phase 4c:

Channels:
- Edit an existing channel and set channel_type to "dimmer" and watt to 750
- Verify "Dimmer" and "750 W" appear in the channel table
- Add two more channels with watt values and verify total watt is summed correctly

Vacant modules:
- Open panel mockup and place a new module — check "Merk som ledig"
- Verify module appears gray with text "Ledig" in canvas
- Attempt to assign a circuit to it — verify blocked (400)

Main switch:
- Place a new module with type "Hovedbryter (OV50)", width 3, ampere 50
- Verify it appears in antrasitt color with "OV" abbreviation
- Attempt to assign a circuit to it — verify blocked (400)

Report HTTP status and result for each step.
```

---

## Definition of Done – Fase 4c

Fase 4c er ferdig når:
- [ ] Alle backend-tester er grønne (inkl. fase 1–4b)
- [ ] Alle frontend-tester er grønne (inkl. fase 1–4b)
- [ ] Alle 5 akseptansekriterier er manuelt verifisert
- [ ] Dimmer/relé vises korrekt i kanalregister
- [ ] Watt summeres per utstyr
- [ ] Ledig modul er visuelt tydelig i skap-mockup
- [ ] Hovedbryter (OV50) fungerer som modultype
- [ ] Smoketest fullført uten feil
- [ ] Kode pushet til `feature/fase4` og klar for merge
