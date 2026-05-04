# Tavla – Fase 2: Tester og akseptansekriterier

## Akseptansekriterier

### AC-1: Skap-canvas rendres korrekt
- [ ] `/skap/:id` viser PanelCanvas basert på `rows` og `modules_per_row` fra API
- [ ] Riktig antall skinnerader rendres (f.eks. 2 rader)
- [ ] Riktig antall modulslots per skinne (f.eks. 12 slots)
- [ ] Hver skinne har etikett til venstre: "Skinne 1", "Skinne 2" etc.
- [ ] Antall ledige slots vises per skinne
- [ ] Tomme slots er grå og klikkbare
- [ ] Canvas er scrollbar horisontalt ved mange moduler

### AC-2: Plassering av ny modul – breddevalg
- [ ] Klikk på tom slot markerer den som startposisjon
- [ ] Dra mot høyre highlighter påfølgende slots
- [ ] Slipper man over en opptatt slot stopper highlightingen før den
- [ ] Slipper man utenfor canvas avsluttes valget uten å åpne dialog
- [ ] Bredde 1–N velges korrekt basert på hvor man slipper

### AC-3: ModuleDialog – visning og validering
- [ ] Dialog åpnes etter breddevalg
- [ ] Type-dropdown viser alle 7 typer med norske navn
- [ ] Ampere-felt vises kun for: automatsikring, jordfeilbryter, kombibryter
- [ ] Kursbetegnelse-felt vises kun for: automatsikring, kombibryter
- [ ] Kursbetegnelse-dropdown viser eksisterende kurser i skapet + tom valg
- [ ] Etikett-felt er alltid synlig
- [ ] Lagre uten type gir valideringsfeil
- [ ] Avbryt lukker dialog uten å lagre
- [ ] Escape-tast lukker dialog

### AC-4: Lagring av modul
- [ ] POST til `/api/panels/{id}/modules` ved lagre
- [ ] Ny modul vises umiddelbart i canvas uten full reload
- [ ] Modulen vises med riktig farge per type
- [ ] Modulen viser ampere og etikett
- [ ] Opptatte slots er ikke lenger klikkbare

### AC-5: Overlapp-validering
- [ ] Kan ikke plassere modul over allerede opptatt slot
- [ ] Kan ikke plassere modul som strekker seg inn i opptatt slot
- [ ] Kan ikke plassere modul som går utenfor skinnens bredde
- [ ] Visuell indikasjon (rød highlight) ved ugyldig plassering

### AC-6: Rediger eksisterende modul
- [ ] Klikk på eksisterende modul åpner ModuleDialog pre-fylt
- [ ] Alle felter viser eksisterende verdier
- [ ] Lagre sender PUT til `/api/modules/{id}`
- [ ] Endringer vises umiddelbart i canvas

### AC-7: Slett modul
- [ ] Høyreklikk eller long-press på modul viser slett-alternativ
- [ ] Bekreftelsesdialog før sletting
- [ ] DELETE til `/api/modules/{id}` ved bekreftelse
- [ ] Slottene frigjøres umiddelbart i canvas

### AC-8: Fargekoding per modultype
- [ ] automatsikring → blå
- [ ] jordfeilbryter → gul
- [ ] kombibryter → grønn
- [ ] Shelly → oransje
- [ ] Dynalite → lilla
- [ ] overspenningsvern → rød
- [ ] annet → grå

### AC-9: Koblingspunkt til kurs
- [ ] Modul med kursbetegnelse viser lenke til kurssiden
- [ ] Klikk på lenken navigerer til `/kurs/:id`

### AC-10: Norske tekster
- [ ] Alle UI-tekster hentes fra `i18n/no.js`
- [ ] Ingen hardkodede norske strenger i komponenter
- [ ] Nye strenger er lagt til i `i18n/no.js` før bruk

---

## Komponenttester (Vitest + React Testing Library)

```javascript
// frontend/src/__tests__/PanelMockup.test.jsx

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import PanelCanvas from '../components/PanelMockup/PanelCanvas'
import ModuleDialog from '../components/PanelMockup/ModuleDialog'
import * as api from '../api/client'

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
)

const mockPanel = {
  id: 1,
  name: 'Hovedtavle',
  location: 'Gang',
  rows: 2,
  modules_per_row: 12,
}

const mockModules = [
  { id: 1, row: 0, position: 0, width: 2, type: 'breaker', ampere: 16, label: 'B01', circuit_id: 1 },
  { id: 2, row: 0, position: 4, width: 1, type: 'rcd', ampere: 40, label: 'JF1', circuit_id: null },
]

const mockCircuits = [
  { id: 1, designation: 'B01', name: 'Lys stue' },
  { id: 2, designation: 'B02', name: 'Stikk stue' },
]

// AC-1: Korrekt antall rader og slots
test('rendrer riktig antall skinnerader', async () => {
  vi.spyOn(api, 'getPanelModules').mockResolvedValue(mockModules)
  render(<PanelCanvas panel={mockPanel} />, { wrapper })
  const rails = await screen.findAllByText(/skinne \d/i)
  expect(rails).toHaveLength(2)
})

test('rendrer riktig antall slots per skinne', async () => {
  vi.spyOn(api, 'getPanelModules').mockResolvedValue([])
  render(<PanelCanvas panel={mockPanel} />, { wrapper })
  // 2 rader × 12 slots = 24 tomme slots
  const slots = await screen.findAllByTestId('empty-slot')
  expect(slots).toHaveLength(24)
})

test('viser antall ledige slots per skinne', async () => {
  vi.spyOn(api, 'getPanelModules').mockResolvedValue(mockModules)
  render(<PanelCanvas panel={mockPanel} />, { wrapper })
  // Skinne 1: 12 - 3 opptatte = 9 ledige
  await waitFor(() => expect(screen.getByText(/9 ledige/i)).toBeInTheDocument())
})

// AC-2: Overlapp-validering
test('opptatte slots er ikke klikkbare', async () => {
  vi.spyOn(api, 'getPanelModules').mockResolvedValue(mockModules)
  const onSelect = vi.fn()
  render(<PanelCanvas panel={mockPanel} onSlotSelect={onSelect} />, { wrapper })
  await waitFor(() => screen.getAllByTestId('occupied-slot'))
  const occupiedSlots = screen.getAllByTestId('occupied-slot')
  await userEvent.click(occupiedSlots[0])
  expect(onSelect).not.toHaveBeenCalled()
})

test('kan ikke plassere modul utenfor skinnens bredde', async () => {
  vi.spyOn(api, 'getPanelModules').mockResolvedValue([])
  render(<PanelCanvas panel={{ ...mockPanel, modules_per_row: 4 }} />, { wrapper })
  // Slot 3 (siste) + dra 2 til høyre skal begrenses til bredde 1
  const slots = await screen.findAllByTestId('empty-slot')
  fireEvent.mouseDown(slots[3])
  fireEvent.mouseEnter(slots[3]) // forsøk å dra forbi kanten
  const highlighted = screen.getAllByTestId('highlighted-slot')
  expect(highlighted).toHaveLength(1) // maks 1, ikke 2
})

// AC-3: ModuleDialog – felter per type
test('viser ampere-felt for automatsikring', () => {
  render(
    <ModuleDialog open={true} onClose={() => {}} onSave={() => {}} circuits={mockCircuits} />,
    { wrapper }
  )
  fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'breaker' } })
  expect(screen.getByLabelText(/ampere/i)).toBeInTheDocument()
})

test('skjuler ampere-felt for Shelly', () => {
  render(
    <ModuleDialog open={true} onClose={() => {}} onSave={() => {}} circuits={mockCircuits} />,
    { wrapper }
  )
  fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'shelly' } })
  expect(screen.queryByLabelText(/ampere/i)).not.toBeInTheDocument()
})

test('viser kursbetegnelse-dropdown for automatsikring', () => {
  render(
    <ModuleDialog open={true} onClose={() => {}} onSave={() => {}} circuits={mockCircuits} />,
    { wrapper }
  )
  fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'breaker' } })
  expect(screen.getByLabelText(/kursbetegnelse/i)).toBeInTheDocument()
  expect(screen.getByText('B01 – Lys stue')).toBeInTheDocument()
})

test('skjuler kursbetegnelse for jordfeilbryter', () => {
  render(
    <ModuleDialog open={true} onClose={() => {}} onSave={() => {}} circuits={mockCircuits} />,
    { wrapper }
  )
  fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'rcd' } })
  expect(screen.queryByLabelText(/kursbetegnelse/i)).not.toBeInTheDocument()
})

test('lagre uten type gir valideringsfeil', async () => {
  render(
    <ModuleDialog open={true} onClose={() => {}} onSave={() => {}} circuits={[]} />,
    { wrapper }
  )
  await userEvent.click(screen.getByText(/lagre/i))
  expect(screen.getByText(/type er påkrevd/i)).toBeInTheDocument()
})

test('escape lukker dialog', async () => {
  const onClose = vi.fn()
  render(
    <ModuleDialog open={true} onClose={onClose} onSave={() => {}} circuits={[]} />,
    { wrapper }
  )
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})

// AC-8: Fargekoding
test('modul har riktig farge-klasse per type', async () => {
  vi.spyOn(api, 'getPanelModules').mockResolvedValue([
    { id: 1, row: 0, position: 0, width: 1, type: 'breaker', ampere: 16, label: 'B01' }
  ])
  render(<PanelCanvas panel={mockPanel} />, { wrapper })
  await waitFor(() => screen.getByTestId('module-1'))
  expect(screen.getByTestId('module-1')).toHaveClass('module-breaker')
})
```

---

## Backend-tester (pytest)

```python
# backend/tests/test_modules.py

def test_create_module(client, panel_factory):
    panel = panel_factory()
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0,
        "position": 0,
        "width": 2,
        "type": "breaker",
        "ampere": 16,
        "label": "B01"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["width"] == 2
    assert data["type"] == "breaker"

def test_module_overlap_blocked(client, panel_factory):
    panel = panel_factory()
    # Plasser modul i posisjon 0-1 (bredde 2)
    client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 0, "width": 2, "type": "breaker", "label": "B01"
    })
    # Forsøk å plassere i posisjon 1 (overlapp)
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 1, "width": 1, "type": "rcd", "label": "JF"
    })
    assert res.status_code == 409

def test_module_outside_panel_width_blocked(client, panel_factory):
    panel = panel_factory()  # 12 moduler per skinne
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 0, "position": 11, "width": 2, "type": "breaker", "label": "B01"
    })
    assert res.status_code == 400

def test_module_wrong_row_blocked(client, panel_factory):
    panel = panel_factory()  # 1 rad
    res = client.post(f"/api/panels/{panel['id']}/modules", json={
        "row": 5, "position": 0, "width": 1, "type": "breaker", "label": "B01"
    })
    assert res.status_code == 400

def test_update_module(client, module_factory):
    module = module_factory()
    res = client.put(f"/api/modules/{module['id']}", json={
        **module, "ampere": 20, "label": "B01-oppdatert"
    })
    assert res.status_code == 200
    assert res.json()["ampere"] == 20

def test_delete_module(client, module_factory):
    module = module_factory()
    res = client.delete(f"/api/modules/{module['id']}")
    assert res.status_code == 200
    # Slot skal nå være ledig igjen
    panel_modules = client.get(f"/api/panels/{module['panel_id']}/modules").json()
    assert not any(m["id"] == module["id"] for m in panel_modules)

def test_get_modules_for_panel(client, panel_factory, module_factory):
    panel = panel_factory()
    module_factory(panel_id=panel["id"], position=0)
    module_factory(panel_id=panel["id"], position=2)
    res = client.get(f"/api/panels/{panel['id']}/modules")
    assert res.status_code == 200
    assert len(res.json()) == 2
```

```python
# Legg til i backend/tests/conftest.py

@pytest.fixture
def module_factory(client, panel_factory):
    def make(panel_id=None, position=0, row=0, width=1, type="breaker", label="B01"):
        if panel_id is None:
            panel = panel_factory()
            panel_id = panel["id"]
        return client.post(f"/api/panels/{panel_id}/modules", json={
            "row": row,
            "position": position,
            "width": width,
            "type": type,
            "label": label,
            "ampere": 16
        }).json()
    return make
```

---

## Kjøre testene

```bash
# Backend
cd backend && pytest tests/test_modules.py -v

# Frontend
cd frontend && npm run test -- PanelMockup
```

---

## Definition of Done – Fase 2

Fase 2 er ferdig når:
- [ ] Alle backend-tester er grønne (inkl. fase 1)
- [ ] Alle frontend-tester er grønne (inkl. fase 1)
- [ ] Alle 10 akseptansekriterier er manuelt verifisert
- [ ] Overlapp-validering fungerer både i frontend og backend
- [ ] Ingen hardkodede norske strenger utenfor `i18n/no.js`
- [ ] Smoke test: opprett skap, plasser 3 ulike modultyper, rediger én, slett én
- [ ] Kode pushet til `feature/fase2` og klar for merge
