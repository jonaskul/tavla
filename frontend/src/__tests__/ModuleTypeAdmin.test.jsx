import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import ModuleTypeAdmin from '../pages/ModuleTypeAdmin'
import App from '../App'
import * as api from '../api/client'

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
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
  vi.spyOn(api, 'getModuleTypes').mockResolvedValue([])
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  )
  expect(screen.getByRole('link', { name: /innstillinger/i })).toBeInTheDocument()
})
