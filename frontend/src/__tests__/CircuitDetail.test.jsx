import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CircuitDetail from '../pages/CircuitDetail'
import * as client from '../api/client'

function wrapper(circuitId = 1) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/kurs/${circuitId}`]}>
        <Routes>
          <Route path="/kurs/:id" element={<CircuitDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const mockCircuit = {
  id: 1,
  panel_id: 10,
  designation: 'B01',
  name: 'Lys stue',
  room: 'Stue',
  cable_type: 'NYM-J',
  cross_section: 1.5,
  conductor_count: 3,
  length_m: 12.0,
  notes: null,
  created_at: '2024-01-01T00:00:00',
}

const mockPanel = {
  id: 10,
  property_id: 5,
  name: 'Hovedtavle',
  location: 'Gang',
  rows: 2,
  modules_per_row: 12,
  created_at: '2024-01-01T00:00:00',
}

const mockCps = [
  { id: 1, circuit_id: 1, type: 'outlet', location: 'Stue nord', notes: null, created_at: '2024-01-01T00:00:00' },
  { id: 2, circuit_id: 1, type: 'light', location: 'Midt i rommet', notes: 'Tak', created_at: '2024-01-01T00:00:00' },
]

const mockChangelog = [
  { id: 1, circuit_id: 1, connection_point_id: null, changed_by: 'Jonas', description: 'Første endring', changed_at: '2024-01-01T12:00:00' },
  { id: 2, circuit_id: 1, connection_point_id: null, changed_by: 'system', description: 'Koblingspunkt opprettet: Stikkontakt – Stue nord', changed_at: '2024-01-02T08:00:00' },
]

beforeEach(() => {
  vi.spyOn(client, 'getCircuit').mockResolvedValue(mockCircuit)
  vi.spyOn(client, 'getPanel').mockResolvedValue(mockPanel)
  vi.spyOn(client, 'getConnectionPoints').mockResolvedValue(mockCps)
  vi.spyOn(client, 'getChangelog').mockResolvedValue(mockChangelog)
  vi.spyOn(client, 'getConnectionPointFiles').mockResolvedValue([])
  vi.spyOn(client, 'createConnectionPoint').mockResolvedValue({
    id: 3, circuit_id: 1, type: 'switch', location: 'Dør', notes: null, created_at: '2024-01-01T00:00:00',
  })
  vi.spyOn(client, 'updateConnectionPoint').mockResolvedValue({
    ...mockCps[0], location: 'Oppdatert',
  })
  vi.spyOn(client, 'deleteConnectionPoint').mockResolvedValue(mockCps[0])
})

describe('CircuitDetail — circuit info', () => {
  it('shows designation and name', async () => {
    render(wrapper())
    await screen.findByText(/B01 — Lys stue/i)
  })

  it('shows room', async () => {
    render(wrapper())
    await screen.findByText('Stue')
  })

  it('shows cable type', async () => {
    render(wrapper())
    await screen.findByText('NYM-J')
  })

  it('shows cross section', async () => {
    render(wrapper())
    await screen.findByText(/1\.5 mm²/)
  })

  it('shows conductor count', async () => {
    render(wrapper())
    await screen.findByText('3')
  })

  it('shows length', async () => {
    render(wrapper())
    await screen.findByText(/12/)
  })

  it('shows back link to panel', async () => {
    render(wrapper())
    await screen.findByText(/Tilbake/i)
    const link = screen.getByRole('link', { name: /Tilbake/i })
    expect(link.getAttribute('href')).toBe('/skap/10')
  })

  it('shows back link to property via panel', async () => {
    render(wrapper())
    await screen.findByText(/Eiendommer/i)
    const link = screen.getAllByRole('link').find((l) => l.getAttribute('href') === '/eiendommer/5')
    expect(link).toBeTruthy()
  })
})

describe('CircuitDetail — connection points', () => {
  it('lists connection points', async () => {
    render(wrapper())
    await screen.findByText('Stikkontakt')
    expect(screen.getByText('Stue nord')).toBeInTheDocument()
    expect(screen.getByText('Lampe/armatur')).toBeInTheDocument()
  })

  it('shows "Legg til koblingspunkt" button', async () => {
    render(wrapper())
    await screen.findByRole('button', { name: /Legg til koblingspunkt/i })
  })

  it('opens add dialog when clicking add button', async () => {
    render(wrapper())
    const btn = await screen.findByRole('button', { name: /Legg til koblingspunkt/i })
    fireEvent.click(btn)
    await screen.findAllByText(/Legg til koblingspunkt/i)
    expect(screen.getAllByText(/Legg til koblingspunkt/i).length).toBeGreaterThan(1)
  })

  it('opens edit dialog pre-filled when clicking edit', async () => {
    render(wrapper())
    const editBtns = await screen.findAllByRole('button', { name: /Rediger/i })
    fireEvent.click(editBtns[0])
    await screen.findByText(/Rediger koblingspunkt/i)
    const input = screen.getByDisplayValue('Stue nord')
    expect(input).toBeInTheDocument()
  })

  it('shows confirmation dialog on delete click', async () => {
    render(wrapper())
    const deleteBtns = await screen.findAllByRole('button', { name: /Slett/i })
    fireEvent.click(deleteBtns[0])
    await screen.findByText(/Er du sikker/i)
  })

  it('shows 409 error when deleting CP with files', async () => {
    client.deleteConnectionPoint.mockRejectedValue({
      response: { status: 409, data: { detail: 'Cannot delete' } },
    })
    render(wrapper())
    const deleteBtns = await screen.findAllByRole('button', { name: /Slett/i })
    fireEvent.click(deleteBtns[0])
    await screen.findByText(/Er du sikker/i)
    const allSlettBtns = screen.getAllByRole('button', { name: /^Slett$/ })
    const confirmBtn = allSlettBtns[allSlettBtns.length - 1]
    fireEvent.click(confirmBtn)
    await screen.findByTestId('delete-cp-error')
    const errEl = screen.getByTestId('delete-cp-error')
    expect(errEl.textContent).toMatch(/filer/i)
  })
})

describe('CircuitDetail — connection point dialog validation', () => {
  it('shows type error when submitting without type', async () => {
    render(wrapper())
    const btn = await screen.findByRole('button', { name: /Legg til koblingspunkt/i })
    fireEvent.click(btn)
    await screen.findByText(/— Velg type —/)
    const saveBtn = screen.getByRole('button', { name: /Lagre/i })
    fireEvent.click(saveBtn)
    await screen.findByText(/Type er påkrevd/i)
  })

  it('shows location error when submitting without location', async () => {
    render(wrapper())
    fireEvent.click(await screen.findByRole('button', { name: /Legg til koblingspunkt/i }))
    await screen.findByText(/— Velg type —/)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'outlet' } })
    fireEvent.click(screen.getByRole('button', { name: /Lagre/i }))
    await screen.findByText(/Plassering er påkrevd/i)
  })
})

describe('CircuitDetail — file upload', () => {
  it('has file input with data-testid="file-input" in files section', async () => {
    render(wrapper())
    const toggleBtns = await screen.findAllByText(/Filer og bilder/i)
    fireEvent.click(toggleBtns[0])
    await screen.findByTestId('file-input')
  })

  it('shows Norwegian error for invalid file type', async () => {
    render(wrapper())
    const toggleBtns = await screen.findAllByText(/Filer og bilder/i)
    fireEvent.click(toggleBtns[0])
    const input = await screen.findByTestId('file-input')
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [file] } })
    await screen.findByText(/Kun JPG, PNG og PDF er tillatt/i)
  })

  it('shows Norwegian error for oversized file', async () => {
    render(wrapper())
    const toggleBtns = await screen.findAllByText(/Filer og bilder/i)
    fireEvent.click(toggleBtns[0])
    const input = await screen.findByTestId('file-input')
    const bigFile = new File([new ArrayBuffer(21 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [bigFile] } })
    await screen.findByText(/Filen er for stor/i)
  })
})

describe('CircuitDetail — changelog', () => {
  it('shows changelog section heading', async () => {
    render(wrapper())
    await screen.findByText('Endringslogg')
  })

  it('shows changelog entries', async () => {
    render(wrapper())
    await screen.findByText('Jonas')
    expect(screen.getByText('Første endring')).toBeInTheDocument()
  })

  it('renders entries newest first', async () => {
    render(wrapper())
    await screen.findByText('Jonas')
    const items = screen.getAllByText(/endring|opprettet/i)
    const jonasIdx = items.findIndex((el) => el.textContent === 'Første endring')
    const systemIdx = items.findIndex((el) => el.textContent.includes('opprettet'))
    expect(systemIdx).toBeLessThan(jonasIdx)
  })

  it('shows "Registrer endring" button', async () => {
    render(wrapper())
    await screen.findByRole('button', { name: /Registrer endring/i })
  })

  it('shows form when clicking "Registrer endring"', async () => {
    render(wrapper())
    fireEvent.click(await screen.findByRole('button', { name: /Registrer endring/i }))
    await screen.findByText('Utført av')
    expect(screen.getByText('Beskrivelse')).toBeInTheDocument()
  })

  it('shows validation errors when submitting empty form', async () => {
    render(wrapper())
    fireEvent.click(await screen.findByRole('button', { name: /Registrer endring/i }))
    await screen.findByText('Utført av')
    fireEvent.click(screen.getByRole('button', { name: /^Lagre$/i }))
    await screen.findByText(/Utført av er påkrevd/i)
  })
})
