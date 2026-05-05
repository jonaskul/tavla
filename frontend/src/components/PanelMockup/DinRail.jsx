import { useModuleTypes } from '../../contexts/ModuleTypesContext'
import Module, { slotPx } from './Module'
import { t } from '../../i18n/no'

export default function DinRail({
  railIndex,
  modulesPerRow,
  modules,
  drag,
  moveDrag,
  shakingModuleId,
  onSlotMouseDown,
  onSlotMouseEnter,
  onModuleMouseDown,
  onSourceGhostMouseEnter,
  onModuleContextMenu,
}) {
  const { byKey } = useModuleTypes()

  const slots = []
  let pos = 0
  while (pos < modulesPerRow) {
    const m = modules.find((m) => m.position === pos)
    if (m) {
      slots.push({ kind: 'module', module: m })
      pos += m.width
    } else {
      slots.push({ kind: 'empty', position: pos })
      pos++
    }
  }

  const isCreateHighlight = (position) => {
    if (!drag || drag.row !== railIndex) return false
    return position >= drag.start && position <= drag.current
  }

  const isMoveTarget = (position) => {
    if (!moveDrag?.isDragging || moveDrag.targetRow !== railIndex || moveDrag.targetPos === null) return false
    return position >= moveDrag.targetPos && position < moveDrag.targetPos + moveDrag.module.width
  }

  const emptyCount = modulesPerRow - modules.reduce((sum, m) => sum + m.width, 0)

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-right shrink-0">
        <p className="text-xs font-medium text-gray-600">{t.panel.rail} {railIndex + 1}</p>
        <p className="text-[10px] text-gray-400">
          {modulesPerRow} mod. — ca. {Math.floor(modulesPerRow / 2)} sikr.
        </p>
        <p className="text-[10px] text-gray-400">{emptyCount} {t.panel.emptySlots}</p>
      </div>

      <div className="flex gap-px" data-testid={`rail-${railIndex}`}>
        {slots.map((slot) => {
          if (slot.kind === 'module') {
            const isBeingDragged = moveDrag?.isDragging && moveDrag.module.id === slot.module.id
            const isShaking = shakingModuleId === slot.module.id

            if (isBeingDragged) {
              const borderColor = byKey[slot.module.type]?.color ?? '#9ca3af'
              return (
                <div
                  key={slot.module.id}
                  data-testid="source-ghost"
                  style={{
                    width: slotPx(slot.module.width),
                    height: 64,
                    borderRadius: 4,
                    border: `2px dashed ${borderColor}`,
                    opacity: 0.4,
                    flexShrink: 0,
                  }}
                  onMouseEnter={() => onSourceGhostMouseEnter(slot.module)}
                />
              )
            }

            return (
              <div key={slot.module.id} data-testid="occupied-slot">
                <Module
                  module={slot.module}
                  isShaking={isShaking}
                  onMouseDown={(e) => onModuleMouseDown(e, slot.module)}
                  onContextMenu={(e) => onModuleContextMenu(e, slot.module)}
                />
              </div>
            )
          }

          const { position } = slot
          const activeCreate = isCreateHighlight(position)
          const activeMove = isMoveTarget(position)
          const moveValid = moveDrag?.isValid

          let cls = 'bg-gray-100 border-gray-300 hover:bg-gray-200'
          if (activeCreate) cls = 'bg-blue-200 border-blue-400'
          else if (activeMove && moveValid)  cls = 'bg-green-200 border-green-400'
          else if (activeMove && !moveValid) cls = 'bg-red-200 border-red-400'

          return (
            <div
              key={`empty-${position}`}
              data-testid={activeCreate || activeMove ? 'highlighted-slot' : 'empty-slot'}
              className={`w-8 h-16 rounded border cursor-pointer transition-colors select-none ${cls}`}
              onMouseDown={() => onSlotMouseDown(railIndex, position)}
              onMouseEnter={() => onSlotMouseEnter(railIndex, position)}
            />
          )
        })}
      </div>
    </div>
  )
}
