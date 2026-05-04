import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import PanelCanvas from '../components/PanelMockup/PanelCanvas'
import ModuleDialog from '../components/PanelMockup/ModuleDialog'
import * as api from '../api/client'

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
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
  vi.spyOn(api, 'getCircuits').mockResolvedValue([])
  render(<PanelCanvas panel={mockPanel} />, { wrapper })
  const rails = await screen.findAllByText(/skinne \d/i)
  expect(rails).toHaveLength(2)
})

test('rendrer riktig antall slots per skinne', async () => {
  vi.spyOn(api, 'getPanelModules').mockResolvedValue([])
  vi.spyOn(api, 'getCircuits').mockResolvedValue([])
  render(<PanelCanvas panel={mockPanel} />, { wrapper })
  // 2 rader × 12 slots = 24 tomme slots
  const slots = await screen.findAllByTestId('empty-slot')
  expect(slots).toHaveLength(24)
})

test('viser antall ledige slots per skinne', async () => {
  vi.spyOn(api, 'getPanelModules').mockResolvedValue(mockModules)
  vi.spyOn(api, 'getCircuits').mockResolvedValue([])
  render(<PanelCanvas panel={mockPanel} />, { wrapper })
  // Skinne 1: 12 - 3 opptatte = 9 ledige
  await waitFor(() => expect(screen.getByText(/9 ledige/i)).toBeInTheDocument())
})

// AC-2: Overlapp-validering
test('opptatte slots er ikke klikkbare', async () => {
  vi.spyOn(api, 'getPanelModules').mockResolvedValue(mockModules)
  vi.spyOn(api, 'getCircuits').mockResolvedValue([])
  const onSelect = vi.fn()
  render(<PanelCanvas panel={mockPanel} onSlotSelect={onSelect} />, { wrapper })
  await waitFor(() => screen.getAllByTestId('occupied-slot'))
  const occupiedSlots = screen.getAllByTestId('occupied-slot')
  await userEvent.click(occupiedSlots[0])
  expect(onSelect).not.toHaveBeenCalled()
})

test('kan ikke plassere modul utenfor skinnens bredde', async () => {
  vi.spyOn(api, 'getPanelModules').mockResolvedValue([])
  vi.spyOn(api, 'getCircuits').mockResolvedValue([])
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
  vi.spyOn(api, 'getCircuits').mockResolvedValue([])
  render(<PanelCanvas panel={mockPanel} />, { wrapper })
  await waitFor(() => screen.getByTestId('module-1'))
  expect(screen.getByTestId('module-1')).toHaveClass('module-breaker')
})
