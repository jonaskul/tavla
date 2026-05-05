import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPanelModules, getCircuits, createModule, updateModule, deleteModule } from '../../api/client'
import DinRail from './DinRail'
import ModuleDialog from './ModuleDialog'
import { t } from '../../i18n/no'

function buildOccupied(modules) {
  const map = {}
  for (const m of modules) {
    for (let i = 0; i < m.width; i++) map[`${m.row}-${m.position + i}`] = m
  }
  return map
}

export default function PanelCanvas({ panel, onSlotSelect }) {
  const qc = useQueryClient()

  const [drag, setDrag]     = useState(null)
  const [dialog, setDialog] = useState(null)

  const { data: modules = [] } = useQuery({
    queryKey: ['modules', panel.id],
    queryFn:  () => getPanelModules(panel.id),
  })
  const { data: circuits = [] } = useQuery({
    queryKey: ['circuits', panel.id],
    queryFn:  () => getCircuits(panel.id),
  })

  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ['modules', panel.id] }),
    [qc, panel.id],
  )

  const createMut = useMutation({ mutationFn: (d) => createModule(panel.id, d), onSuccess: invalidate })
  const updateMut = useMutation({ mutationFn: ({ id, data }) => updateModule(id, data), onSuccess: invalidate })
  const deleteMut = useMutation({ mutationFn: (id) => deleteModule(id), onSuccess: invalidate })

  // Global mouseup: commit drag → open create dialog
  useEffect(() => {
    const up = () => {
      setDrag((d) => {
        if (d) {
          const width = d.current - d.start + 1
          const sel = { mode: 'create', row: d.row, position: d.start, width }
          setDialog(sel)
          onSlotSelect?.(sel)
        }
        return null
      })
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [onSlotSelect])

  const occupied = buildOccupied(modules)

  const handleSlotMouseDown = (row, position) => {
    if (occupied[`${row}-${position}`]) return
    setDrag({ row, start: position, current: position })
  }

  const handleSlotMouseEnter = (row, position) => {
    if (!drag || drag.row !== row) return
    if (occupied[`${row}-${position}`]) return
    let end = drag.start
    for (let p = drag.start; p <= position; p++) {
      if (occupied[`${row}-${p}`]) break
      end = p
    }
    setDrag((d) => ({ ...d, current: end }))
  }

  const handleSlotMouseUp = () => {}

  const handleModuleClick = (module) => {
    setDialog({ mode: 'edit', row: module.row, position: module.position, width: module.width, module })
  }

  const handleModuleContextMenu = (e, module) => {
    e.preventDefault()
    if (window.confirm(t.common.confirmDelete)) deleteMut.mutate(module.id)
  }

  const handleSave = (formData) => {
    if (dialog.mode === 'create') {
      createMut.mutate({ row: dialog.row, position: dialog.position, width: dialog.width, ...formData })
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

      <div className="overflow-x-auto">
        <div className="space-y-2 min-w-max">
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
      </div>

      <ModuleDialog
        key={dialog ? (dialog.module?.id ?? `new-${dialog.row}-${dialog.position}`) : 'closed'}
        open={!!dialog}
        module={dialog?.module}
        circuits={circuits}
        onSave={handleSave}
        onDelete={dialog?.mode === 'edit' ? handleDelete : undefined}
        onClose={() => setDialog(null)}
      />
    </div>
  )
}
