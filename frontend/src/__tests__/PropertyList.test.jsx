import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import Properties from '../pages/Properties'
import { vi } from 'vitest'
import * as api from '../api/client'

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
)

test('viser melding når ingen eiendommer finnes', async () => {
  vi.spyOn(api, 'getProperties').mockResolvedValue([])
  render(<Properties />, { wrapper })
  await waitFor(() => screen.getByText(/ingen eiendommer/i))
})

test('viser liste over eiendommer', async () => {
  vi.spyOn(api, 'getProperties').mockResolvedValue([
    { id: 1, name: 'Hjemme', address: 'Testveien 1' },
  ])
  render(<Properties />, { wrapper })
  await waitFor(() => screen.getByText('Hjemme'))
})

test('skjema validerer påkrevde felt', async () => {
  vi.spyOn(api, 'getProperties').mockResolvedValue([])
  render(<Properties />, { wrapper })
  await userEvent.click(screen.getByText(/legg til eiendom/i))
  await userEvent.click(screen.getByText(/lagre/i))
  expect(screen.getByText(/navn er påkrevd/i)).toBeInTheDocument()
})
