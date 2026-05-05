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

  const [drag, setDrag] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [shakingModuleId, setShakingModuleId] = useState(null)

  // moveDrag uses a ref (for global handlers) + state (for rendering)
  const moveDragRef = useRef(null)
  const [moveDrag, _setMoveDrag] = useState(null)

  // Stable refs for values used in the global useEffect (empty deps)
  const onSlotSelectRef = useRef(onSlotSelect)
  onSlotSelectRef.current = onSlotSelect
  const occupiedRef = useRef({})

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

  // Keep a ref to updateMut.mutate (stable per React Query docs, but safe to ref anyway)
  const updateMutRef = useRef(updateMut)
  updateMutRef.current = updateMut

  // Compute occupied map each render and sync to ref
  const occupied = buildOccupied(modules)
  occupiedRef.current = occupied

  // Apply grabbing cursor globally while dragging
  useEffect(() => {
    if (moveDrag?.isDragging) {
      document.body.style.cursor = 'grabbing'
      return () => { document.body.style.cursor = '' }
    }
  }, [moveDrag?.isDragging])

  // Global mouse handlers — registered once, use refs for current values
  useEffect(() => {
    const onMouseMove = (e) => {
      const md = moveDragRef.current
      if (!md) return
      if (!md.isDragging && Math.hypot(e.clientX - md.startX, e.clientY - md.startY) < DRAG_THRESHOLD) return
      const next = { ...md, isDragging: true, mouseX: e.clientX, mouseY: e.clientY }
      moveDragRef.current = next
      _setMoveDrag(next)
    }

    const onMouseUp = () => {
      const md = moveDragRef.current

      if (!md) {
        // Handle create drag
        setDrag((d) => {
          if (d) {
            const width = d.current - d.start + 1
            const sel = { mode: 'create', row: d.row, position: d.start, width }
            setDialog(sel)
            onSlotSelectRef.current?.(sel)
          }
          return null
        })
        return
      }

      // Clear move drag
      moveDragRef.current = null
      _setMoveDrag(null)

      if (!md.isDragging) {
        // Click → open edit dialog
        setDialog({ mode: 'edit', row: md.module.row, position: md.module.position, width: md.module.width, module: md.module })
        return
      }

      if (md.targetRow === null || !md.isValid) {
        // Invalid drop → shake animation
        setShakingModuleId(md.module.id)
        setTimeout(() => setShakingModuleId(null), 400)
        return
      }

      if (md.targetRow === md.module.row && md.targetPos === md.module.position) {
        // Dropped on same slot → edit
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
  }, []) // empty deps — all dynamic values accessed via refs

  const checkMoveFits = (module, row, pos) => {
    const occ = occupiedRef.current
    if (pos < 0 || pos + module.width > panel.modules_per_row) return false
    for (let i = 0; i < module.width; i++) {
      const cell = occ[`${row}-${pos + i}`]
      if (cell && cell.id !== module.id) return false
    }
    return true
  }

  const handleSlotMouseDown = (row, position) => {
    if (occupied[`${row}-${position}`]) return
    setDrag({ row, start: position, current: position })
  }

  const handleSlotMouseEnter = (row, position) => {
    const md = moveDragRef.current
    if (md?.isDragging) {
      const valid = checkMoveFits(md.module, row, position)
      const next = { ...md, targetRow: row, targetPos: position, isValid: valid }
      moveDragRef.current = next
      _setMoveDrag(next)
      return
    }

    if (!drag || drag.row !== row) return
    if (occupied[`${row}-${position}`]) return
    let end = drag.start
    for (let p = drag.start; p <= position; p++) {
      if (occupied[`${row}-${p}`]) break
      end = p
    }
    setDrag((d) => ({ ...d, current: end }))
  }

  // When mouse re-enters the source ghost during a move drag, reset target to source position
  const handleSourceGhostMouseEnter = (module) => {
    const md = moveDragRef.current
    if (!md?.isDragging || md.module.id !== module.id) return
    const next = { ...md, targetRow: module.row, targetPos: module.position, isValid: true }
    moveDragRef.current = next
    _setMoveDrag(next)
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
              onSourceGhostMouseEnter={handleSourceGhostMouseEnter}
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
