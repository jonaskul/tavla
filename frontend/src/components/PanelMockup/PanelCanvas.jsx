import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPanel, getModules, getCircuits, createModule, updateModule, deleteModule } from '../../api/client'
import DinRail from './DinRail'
import ModuleDialog from './ModuleDialog'
import { t } from '../../i18n/no'

// Build a lookup: `${row}-${pos}` → module object for every cell a module occupies
function buildOccupied(modules) {
  const map = {}
  for (const m of modules) {
    for (let i = 0; i < m.width; i++) {
      map[`${m.row}-${m.position + i}`] = m
    }
  }
  return map
}

// Find the furthest position reachable from `start` in `row` without hitting an occupied cell
function maxReach(start, row, modulesPerRow, occupied) {
  let end = start
  while (end + 1 < modulesPerRow && !occupied[`${row}-${end + 1}`]) {
    end++
  }
  return end
}

export default function PanelCanvas({ panelId }) {
  const qc = useQueryClient()

  const [drag, setDrag]     = useState(null)   // {row, start, current} | null
  const [dialog, setDialog] = useState(null)   // {mode, row, position, width, module?} | null

  const { data: panel } = useQuery({
    queryKey: ['panel', panelId],
    queryFn:  () => getPanel(panelId),
  })
  const { data: modules = [] } = useQuery({
    queryKey: ['modules', panelId],
    queryFn:  () => getModules(panelId),
    enabled:  !!panel,
  })
  const { data: circuits = [] } = useQuery({
    queryKey: ['circuits', panelId],
    queryFn:  () => getCircuits(panelId),
    enabled:  !!panel,
  })

  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ['modules', panelId] }),
    [qc, panelId],
  )

  const createMut = useMutation({ mutationFn: (d) => createModule(panelId, d), onSuccess: invalidate })
  const updateMut = useMutation({ mutationFn: ({ id, data }) => updateModule(id, data), onSuccess: invalidate })
  const deleteMut = useMutation({ mutationFn: (id) => deleteModule(id), onSuccess: invalidate })

  // Release drag on global mouseup (handles release outside the component)
  useEffect(() => {
    const up = () => {
      setDrag((d) => {
        if (d) {
          const width = d.current - d.start + 1
          setDialog({ mode: 'create', row: d.row, position: d.start, width })
        }
        return null
      })
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  if (!panel) return null

  const occupied = buildOccupied(modules)

  const handleSlotMouseDown = (row, position) => {
    if (occupied[`${row}-${position}`]) return
    setDrag({ row, start: position, current: position })
  }

  const handleSlotMouseEnter = (row, position) => {
    if (!drag || drag.row !== row) return
    if (occupied[`${row}-${position}`]) return
    // Clamp to last unoccupied position between start and here
    let end = drag.start
    for (let p = drag.start; p <= position; p++) {
      if (occupied[`${row}-${p}`]) break
      end = p
    }
    setDrag((d) => ({ ...d, current: end }))
  }

  // mouseUp on slot: let the window listener handle opening the dialog
  const handleSlotMouseUp = () => {}

  const handleModuleClick = (module) => {
    setDialog({ mode: 'edit', row: module.row, position: module.position, width: module.width, module })
  }

  const handleModuleContextMenu = (e, module) => {
    e.preventDefault()
    if (window.confirm(t.common.confirmDelete)) {
      deleteMut.mutate(module.id)
    }
  }

  const handleSave = (formData) => {
    if (dialog.mode === 'create') {
      createMut.mutate({
        row: dialog.row, position: dialog.position, width: dialog.width,
        ...formData,
      })
    } else {
      updateMut.mutate({ id: dialog.module.id, data: formData })
    }
    setDialog(null)
  }

  const handleDelete = () => {
    deleteMut.mutate(dialog.module.id)
    setDialog(null)
  }

  return (
    <div className="select-none" onMouseLeave={() => setDrag(null)}>
      <h2 className="text-lg font-semibold text-gray-800 mb-3">{t.panel.mockup}</h2>

      <div className="space-y-2">
        {Array.from({ length: panel.rows }, (_, row) => (
          <DinRail
            key={row}
            railIndex={row}
            modulesPerRow={panel.modules_per_row}
            modules={modules.filter((m) => m.row === row)}
            drag={drag}
            onSlotMouseDown={handleSlotMouseDown}
            onSlotMouseEnter={handleSlotMouseEnter}
            onSlotMouseUp={handleSlotMouseUp}
            onModuleClick={handleModuleClick}
            onModuleContextMenu={handleModuleContextMenu}
          />
        ))}
      </div>

      {dialog && (
        <ModuleDialog
          mode={dialog.mode}
          module={dialog.module}
          circuits={circuits}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
