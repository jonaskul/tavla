import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import ModuleDialog from '../components/PanelMockup/ModuleDialog'
import { ModuleTypesProvider } from '../contexts/ModuleTypesContext'
import * as api from '../api/client'

const mockTypes = [
  { id: 1, key: 'breaker', name_no: 'Automatsikring', color: '#2563eb',
    abbreviation: 'LS', can_have_circuit: true, can_have_ampere: true,
    is_builtin: true, usage_count: 0 },
  { id: 2, key: 'rcd', name_no: 'Jordfeilbryter', color: '#ca8a04',
    abbreviation: 'JF', can_have_circuit: false, can_have_ampere: true,
    is_builtin: true, usage_count: 0 },
  { id: 3, key: 'my_custom', name_no: 'Min type', color: '#ff0000',
    abbreviation: 'MT', can_have_circuit: true, can_have_ampere: false,
    is_builtin: false, usage_count: 0 },
]

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ModuleTypesProvider>
      <MemoryRouter>{children}</MemoryRouter>
    </ModuleTypesProvider>
  </QueryClientProvider>
)

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
  render(
    <ModuleDialog
      open={true}
      onClose={() => {}}
      onSave={() => {}}
      circuits={[{ id: 1, designation: 'B01', name: 'Lys' }]}
    />,
    { wrapper }
  )
  await waitFor(() => screen.getByLabelText(/type/i))
  fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'rcd' } })
  expect(screen.queryByLabelText(/kursbetegnelse/i)).not.toBeInTheDocument()
})
