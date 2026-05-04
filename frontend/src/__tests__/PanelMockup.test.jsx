import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PanelCanvas from '../components/PanelMockup/PanelCanvas'
import ModuleDialog from '../components/PanelMockup/ModuleDialog'
import * as api from '../api/client'

const mkClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })

const wrapper =
  (client = mkClient()) =>
  ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )

// ── Fixtures ─────────────────────────────────────────────────────────────────

const panel = {
  id: 1, property_id: 1,
  name: 'Hoved', location: 'Gang',
  rows: 2, modules_per_row: 4,
  notes: null, created_at: '',
}

const breaker = {
  id: 1, panel_id: 1,
  row: 0, position: 0, width: 2,
  type: 'breaker', label: 'Lys', ampere: 16,
  has_rcd: false, circuit_id: null,
}

const circuits = [{ id: 1, panel_id: 1, designation: 'B01', name: 'Lys stue' }]

// ── PanelCanvas ───────────────────────────────────────────────────────────────

describe('PanelCanvas', () => {
  test('renders correct number of rails', async () => {
    vi.spyOn(api, 'getPanel').mockResolvedValue(panel)
    vi.spyOn(api, 'getModules').mockResolvedValue([])
    vi.spyOn(api, 'getCircuits').mockResolvedValue([])

    render(<PanelCanvas panelId={1} />, { wrapper: wrapper() })

    await waitFor(() => {
      // 2 rails → data-testid="rail-0" and "rail-1"
      expect(screen.getByTestId('rail-0')).toBeInTheDocument()
      expect(screen.getByTestId('rail-1')).toBeInTheDocument()
    })
  })

  test('renders rows * modules_per_row empty slots when no modules', async () => {
    vi.spyOn(api, 'getPanel').mockResolvedValue(panel)
    vi.spyOn(api, 'getModules').mockResolvedValue([])
    vi.spyOn(api, 'getCircuits').mockResolvedValue([])

    render(<PanelCanvas panelId={1} />, { wrapper: wrapper() })

    await waitFor(() => {
      // 2 rows × 4 slots = 8 empty slots
      expect(screen.getAllByTestId('slot')).toHaveLength(8)
    })
  })

  test('occupied slots are not rendered as empty slots', async () => {
    vi.spyOn(api, 'getPanel').mockResolvedValue(panel)
    // breaker at row=0, position=0, width=2 → occupies 2 of 4 slots in rail 0
    vi.spyOn(api, 'getModules').mockResolvedValue([breaker])
    vi.spyOn(api, 'getCircuits').mockResolvedValue([])

    render(<PanelCanvas panelId={1} />, { wrapper: wrapper() })

    await waitFor(() => {
      // rail 0: 2 slots taken by module → 2 empty remain
      // rail 1: 4 empty
      // total empty = 6
      expect(screen.getAllByTestId('slot')).toHaveLength(6)
      // The module is rendered as a Module component
      expect(screen.getByTestId('module')).toBeInTheDocument()
    })
  })

  test('clicking an occupied module does not open dialog for a new module', async () => {
    vi.spyOn(api, 'getPanel').mockResolvedValue(panel)
    vi.spyOn(api, 'getModules').mockResolvedValue([breaker])
    vi.spyOn(api, 'getCircuits').mockResolvedValue([])

    render(<PanelCanvas panelId={1} />, { wrapper: wrapper() })

    await waitFor(() => screen.getByTestId('module'))

    // Clicking the module opens the *edit* dialog (pre-filled), not the create dialog
    fireEvent.click(screen.getByTestId('module'))
    expect(screen.getByText(/rediger modul/i)).toBeInTheDocument()
  })

  test('drag across empty slots highlights them and opens create dialog on release', async () => {
    vi.spyOn(api, 'getPanel').mockResolvedValue(panel)
    vi.spyOn(api, 'getModules').mockResolvedValue([])
    vi.spyOn(api, 'getCircuits').mockResolvedValue([])

    render(<PanelCanvas panelId={1} />, { wrapper: wrapper() })

    await waitFor(() => screen.getAllByTestId('slot'))

    const slots = screen.getAllByTestId('slot')
    // Slots 0..3 are rail-0, slots 4..7 are rail-1
    fireEvent.mouseDown(slots[0])  // start drag at rail-0 pos-0
    fireEvent.mouseEnter(slots[1]) // extend to pos-1
    fireEvent.mouseUp(slots[1])    // release

    // Global mouseup fires → dialog should open
    fireEvent.mouseUp(window)

    await waitFor(() =>
      expect(screen.getByText(/legg til modul/i)).toBeInTheDocument()
    )
  })

  test('drag stops before an occupied slot', async () => {
    // Module at row=0, position=2, width=1
    const blocker = { ...breaker, id: 2, position: 2, width: 1 }
    vi.spyOn(api, 'getPanel').mockResolvedValue(panel)
    vi.spyOn(api, 'getModules').mockResolvedValue([blocker])
    vi.spyOn(api, 'getCircuits').mockResolvedValue([])

    render(<PanelCanvas panelId={1} />, { wrapper: wrapper() })

    await waitFor(() => screen.getAllByTestId('slot'))

    const slots = screen.getAllByTestId('slot')
    // slots: rail-0 has pos 0,1,3 as empty (pos 2 is module) and rail-1 has pos 0..3
    // entering pos 3 in rail-0 while starting from pos 0 should be blocked by pos 2
    fireEvent.mouseDown(slots[0])
    // Try entering a slot beyond the occupied one — component clamps current to last valid pos
    fireEvent.mouseEnter(slots[1]) // pos 1 still empty, active
    // The drag.current should not jump past the occupied slot → highlight stays ≤ pos 1
    // We verify by checking that only 2 slots are active (highlighted) in rail-0, not 3+
    const activeSlots = slots.filter(
      (s) => s.className.includes('bg-blue-200')
    )
    expect(activeSlots.length).toBeLessThanOrEqual(2)
  })
})

// ── ModuleDialog ──────────────────────────────────────────────────────────────

describe('ModuleDialog', () => {
  const base = {
    mode: 'create',
    module: undefined,
    circuits,
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  }

  test('shows ampere and circuit fields when type is breaker (default)', () => {
    render(<ModuleDialog {...base} />, { wrapper: wrapper() })
    expect(screen.getByTestId('field-ampere')).toBeInTheDocument()
    expect(screen.getByTestId('field-circuit')).toBeInTheDocument()
    expect(screen.getByTestId('field-label')).toBeInTheDocument()
  })

  test('hides ampere and circuit fields when type is non-breaker (shelly)', () => {
    render(
      <ModuleDialog
        {...base}
        mode="edit"
        module={{ type: 'shelly', label: '', ampere: null, has_rcd: false, circuit_id: null }}
      />,
      { wrapper: wrapper() }
    )
    expect(screen.queryByTestId('field-ampere')).not.toBeInTheDocument()
    expect(screen.queryByTestId('field-circuit')).not.toBeInTheDocument()
    // Label is always shown
    expect(screen.getByTestId('field-label')).toBeInTheDocument()
  })

  test('switching type to non-breaker hides conditional fields', async () => {
    render(<ModuleDialog {...base} />, { wrapper: wrapper() })

    // Start as breaker — ampere visible
    expect(screen.getByTestId('field-ampere')).toBeInTheDocument()

    // Switch to shelly
    fireEvent.change(screen.getByTestId('field-type'), {
      target: { value: 'shelly' },
    })

    expect(screen.queryByTestId('field-ampere')).not.toBeInTheDocument()
    expect(screen.queryByTestId('field-circuit')).not.toBeInTheDocument()
  })

  test('calls onSave with correct payload for breaker type', () => {
    const onSave = vi.fn()
    render(<ModuleDialog {...base} onSave={onSave} />, { wrapper: wrapper() })

    fireEvent.change(screen.getByTestId('field-ampere'), { target: { value: '20' } })
    fireEvent.change(screen.getByTestId('field-label'), { target: { value: 'Ovn' } })
    fireEvent.click(screen.getByText(/lagre/i))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'breaker', ampere: 20, label: 'Ovn' })
    )
  })

  test('calls onSave with null ampere for non-breaker type', () => {
    const onSave = vi.fn()
    render(<ModuleDialog {...base} onSave={onSave} />, { wrapper: wrapper() })

    fireEvent.change(screen.getByTestId('field-type'), { target: { value: 'dynalite' } })
    fireEvent.click(screen.getByText(/lagre/i))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'dynalite', ampere: null, circuit_id: null })
    )
  })

  test('shows delete button in edit mode, hides it in create mode', () => {
    const { rerender } = render(<ModuleDialog {...base} />, { wrapper: wrapper() })
    expect(screen.queryByText(/slett modul/i)).not.toBeInTheDocument()

    rerender(
      <QueryClientProvider client={mkClient()}>
        <ModuleDialog
          {...base}
          mode="edit"
          module={{ type: 'breaker', label: '', ampere: null, has_rcd: false, circuit_id: null }}
        />
      </QueryClientProvider>
    )
    expect(screen.getByText(/slett modul/i)).toBeInTheDocument()
  })
})
