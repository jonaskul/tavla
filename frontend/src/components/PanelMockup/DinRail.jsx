import Module from './Module'
import { t } from '../../i18n/no'

export default function DinRail({
  railIndex,
  modulesPerRow,
  modules,
  drag,
  onSlotMouseDown,
  onSlotMouseEnter,
  onSlotMouseUp,
  onModuleClick,
  onModuleContextMenu,
}) {
  // Build a slot array left-to-right, merging occupied runs into module entries
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

  const isDragging = (position) => {
    if (!drag || drag.row !== railIndex) return false
    return position >= drag.start && position <= drag.current
  }

  const emptyCount = modulesPerRow - modules.reduce((sum, m) => sum + m.width, 0)

  return (
    <div className="flex items-center gap-3">
      {/* Rail label */}
      <div className="w-20 text-right shrink-0">
        <p className="text-xs font-medium text-gray-600">
          {t.panel.rail} {railIndex + 1}
        </p>
        <p className="text-[10px] text-gray-400">
          {emptyCount} {t.panel.emptySlots}
        </p>
      </div>

      {/* Slots */}
      <div
        className="flex gap-px"
        data-testid={`rail-${railIndex}`}
      >
        {slots.map((slot) => {
          if (slot.kind === 'module') {
            return (
              <Module
                key={slot.module.id}
                module={slot.module}
                onClick={() => onModuleClick(slot.module)}
                onContextMenu={(e) => onModuleContextMenu(e, slot.module)}
              />
            )
          }

          const { position } = slot
          const active = isDragging(position)

          return (
            <div
              key={`empty-${position}`}
              data-testid="slot"
              className={[
                'w-8 h-16 rounded border cursor-pointer transition-colors select-none',
                active
                  ? 'bg-blue-200 border-blue-400'
                  : 'bg-gray-100 border-gray-300 hover:bg-gray-200',
              ].join(' ')}
              onMouseDown={() => onSlotMouseDown(railIndex, position)}
              onMouseEnter={() => onSlotMouseEnter(railIndex, position)}
              onMouseUp={() => onSlotMouseUp(railIndex, position)}
            />
          )
        })}
      </div>
    </div>
  )
}
