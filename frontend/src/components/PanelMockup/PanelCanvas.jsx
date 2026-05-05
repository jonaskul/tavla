import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPanelModules, getCircuits, createModule, updateModule, deleteModule } from '../../api/client'
import { useModuleTypes } from '../../contexts/ModuleTypesContext'
import DinRail from './DinRail'
import ModuleDialog from './ModuleDialog'
import { hexTextColor, slotPx } from './Module'
import { t } from '../../i18n/no'

const DRAG_THRESHOLD = 5

function buildOccupied(modules) {
  const map = {}
  for (const m of modules) {
    for (let i = 0; i < m.width; i++) map[`${m.row}-${m.position + i}`] = m
  }
  return map
}

function DragGhost({ moveDrag, byKey }) {
  const { module, mouseX, mouseY, offsetX, offsetY } = moveDrag
  const typeDef = byKey[module.type]
  const bgColor = module.is_vacant ? '#e5e7eb' : (typeDef?.color ?? '#9ca3af')
  const textColor = module.is_vacant ? '#9ca3af' : hexTextColor(bgColor)

  return (
    <div
      style={{
        position: 'fixed',
        left: mouseX - offsetX,
        top: mouseY - offsetY,
        width: slotPx(module.width),
        height: 64,
        backgroundColor: bgColor,
        color: textColor,
        borderRadius: 4,
        opacity: 0.7,
        pointerEvents: 'none',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        userSelect: 'none',
      }}
    >
      {module.is_vacant ? (
        <span style={{ fontSize: 12, fontStyle: 'italic' }}>Ledig</span>
      ) : (
        <>
          <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1 }}>
            {typeDef?.abbreviation ?? '?'}
          </span>
          {module.ampere != null && (
            <span style={{ fontSize: 12, lineHeight: 1 }}>{module.ampere}A</span>
          )}
          {module.label && (
            <span style={{ fontSize: 10, lineHeight: 1 }}>{module.label}</span>
          )}
        </>
      )}
    </div>
  )
}

export default function PanelCanvas({ panel, onSlotSelect }) {
  const qc = useQueryClient()
  const { byKey } = useModuleTypes()

  // drag: create-drag (empty-slot selection)
  // drag.anchor = fixed point (mousedown), drag.current = other end (can be < anchor)
  const [drag, setDrag] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [shakingModuleId, setShakingModuleId] = useState(null)

  const moveDragRef = useRef(null)
  const [moveDrag, _setMoveDrag] = useState(null)

  const onSlotSelectRef = useRef(onSlotSelect)
  onSlotSelectRef.current = onSlotSelect
  const occupiedRef = useRef({})
  const panelMprRef = useRef(panel.modules_per_row)
  panelMprRef.current = panel.modules_per_row

  const { data: modules = [] } = useQuery({
    queryKey: ['modules', panel.id],
    queryFn: () => getPanelModules(panel.id),
  })
  const { data: circuits = [] } = useQuery({
    queryKey: ['circuits', panel.id],
    queryFn: () => getCircuits(panel.id),
  })

  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ['modules', panel.id] }),
    [qc, panel.id],
  )

  const createMut = useMutation({ mutationFn: (d) => createModule(panel.id, d), onSuccess: invalidate })
  const updateMut = useMutation({ mutationFn: ({ id, data }) => updateModule(id, data), onSuccess: invalidate })
  const deleteMut = useMutation({ mutationFn: (id) => deleteModule(id), onSuccess: invalidate })

  const updateMutRef = useRef(updateMut)
  updateMutRef.current = updateMut

  const occupied = buildOccupied(modules)
  occupiedRef.current = occupied

  useEffect(() => {
    if (moveDrag?.isDragging) {
      document.body.style.cursor = 'grabbing'
      return () => { document.body.style.cursor = '' }
    }
  }, [moveDrag?.isDragging])

  useEffect(() => {
    // Check if a move-drag module fits at (row, pos) — runs in global handler, uses refs
    const fitsAt = (mod, row, pos) => {
      const occ = occupiedRef.current
      const mpr = panelMprRef.current
      if (pos < 0 || pos + mod.width > mpr) return false
      for (let i = 0; i < mod.width; i++) {
        const cell = occ[`${row}-${pos + i}`]
        if (cell && cell.id !== mod.id) return false
      }
      return true
    }

    const onMouseMove = (e) => {
      const md = moveDragRef.current
      if (!md) return
      if (!md.isDragging && Math.hypot(e.clientX - md.startX, e.clientY - md.startY) < DRAG_THRESHOLD) return

      // Use elementsFromPoint to find the slot under the cursor (reliable in both directions)
      let targetRow = null
      let targetPos = null
      let isValid = false

      const els = document.elementsFromPoint(e.clientX, e.clientY)
      for (const el of els) {
        const sr = el.dataset.slotRow
        const sp = el.dataset.slotPos
        if (sr !== undefined && sp !== undefined) {
          const row = parseInt(sr, 10)
          const pos = parseInt(sp, 10)
          targetRow = row
          targetPos = pos
          isValid = fitsAt(md.module, row, pos)
          break
        }
      }

      const next = { ...md, isDragging: true, mouseX: e.clientX, mouseY: e.clientY, targetRow, targetPos, isValid }
      moveDragRef.current = next
      _setMoveDrag(next)
    }

    const onMouseUp = () => {
      const md = moveDragRef.current

      if (!md) {
        // Handle create drag
        setDrag((d) => {
          if (d) {
            const selStart = Math.min(d.anchor, d.current)
            const selEnd   = Math.max(d.anchor, d.current)
            const width = selEnd - selStart + 1
            const sel = { mode: 'create', row: d.row, position: selStart, width }
            setDialog(sel)
            onSlotSelectRef.current?.(sel)
          }
          return null
        })
        return
      }

      moveDragRef.current = null
      _setMoveDrag(null)

      if (!md.isDragging) {
        setDialog({ mode: 'edit', row: md.module.row, position: md.module.position, width: md.module.width, module: md.module })
        return
      }

      if (md.targetRow === null || !md.isValid) {
        setShakingModuleId(md.module.id)
        setTimeout(() => setShakingModuleId(null), 400)
        return
      }

      if (md.targetRow === md.module.row && md.targetPos === md.module.position) {
        setDialog({ mode: 'edit', row: md.module.row, position: md.module.position, width: md.module.width, module: md.module })
        return
      }

      updateMutRef.current.mutate({ id: md.module.id, data: { row: md.targetRow, position: md.targetPos } })
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // Bidirectional create-drag selection via slot onMouseEnter
  const handleSlotMouseDown = (row, position) => {
    if (occupied[`${row}-${position}`]) return
    setDrag({ row, anchor: position, current: position })
  }

  const handleSlotMouseEnter = (row, position) => {
    // Move drag is handled entirely by onMouseMove — skip here
    if (moveDragRef.current?.isDragging) return

    if (!drag || drag.row !== row) return
    if (occupied[`${row}-${position}`]) return

    let newCurrent
    if (position >= drag.anchor) {
      // Extending right: stop before any occupied slot
      newCurrent = drag.anchor
      for (let p = drag.anchor + 1; p <= position; p++) {
        if (occupied[`${row}-${p}`]) break
        newCurrent = p
      }
    } else {
      // Extending left: stop before any occupied slot
      newCurrent = drag.anchor
      for (let p = drag.anchor - 1; p >= position; p--) {
        if (occupied[`${row}-${p}`]) break
        newCurrent = p
      }
    }
    setDrag((d) => ({ ...d, current: newCurrent }))
  }

  const handleModuleMouseDown = (e, module) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const data = {
      module,
      startX: e.clientX,
      startY: e.clientY,
      mouseX: e.clientX,
      mouseY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      isDragging: false,
      targetRow: null,
      targetPos: null,
      isValid: false,
    }
    moveDragRef.current = data
    _setMoveDrag(data)
  }

  const handleModuleContextMenu = (e, module) => {
    e.preventDefault()
    if (window.confirm(t.common.confirmDelete)) deleteMut.mutate(module.id)
  }

  const handleSave = (formData) => {
    if (dialog.mode === 'create') {
      createMut.mutate({ row: dialog.row, position: dialog.position, ...formData })
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
              moveDrag={moveDrag}
              shakingModuleId={shakingModuleId}
              onSlotMouseDown={handleSlotMouseDown}
              onSlotMouseEnter={handleSlotMouseEnter}
              onModuleMouseDown={handleModuleMouseDown}
              onModuleContextMenu={handleModuleContextMenu}
            />
          ))}
        </div>
      </div>

      {moveDrag?.isDragging && <DragGhost moveDrag={moveDrag} byKey={byKey} />}

      <ModuleDialog
        key={dialog ? (dialog.module?.id ?? `new-${dialog.row}-${dialog.position}`) : 'closed'}
        open={!!dialog}
        module={dialog?.module}
        initialWidth={dialog?.width ?? 1}
        circuits={circuits}
        onSave={handleSave}
        onDelete={dialog?.mode === 'edit' ? handleDelete : undefined}
        onClose={() => setDialog(null)}
      />
    </div>
  )
}
