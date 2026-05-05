import { useModuleTypes } from '../../contexts/ModuleTypesContext'

export function hexTextColor(hex) {
  if (!hex || hex.length < 7) return '#ffffff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#111827' : '#ffffff'
}

// Each slot is 32px wide with 1px gap → pixel width = width * 33 - 1
export const slotPx = (width) => width * 33 - 1

export default function Module({ module, isShaking, onMouseDown, onContextMenu }) {
  const { byKey } = useModuleTypes()
  const isVacant = module.is_vacant
  const typeDef = byKey[module.type]

  const bgColor = isVacant ? '#e5e7eb' : (typeDef?.color ?? '#9ca3af')
  const textColor = isVacant ? '#9ca3af' : hexTextColor(bgColor)
  const abbr = isVacant ? null : (typeDef?.abbreviation ?? '?')

  return (
    <div
      data-testid="draggable-module"
      className={`${isShaking ? 'shake' : ''} module-${module.type} ${isVacant ? 'module-vacant' : ''} h-16 rounded flex flex-col items-center justify-center cursor-grab select-none px-1 shrink-0`}
      style={{ width: slotPx(module.width), backgroundColor: bgColor, color: textColor }}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
    >
      {isVacant ? (
        <span className="text-xs leading-none italic">Ledig</span>
      ) : (
        <>
          <span className="text-xs font-bold leading-none">{abbr}</span>
          {module.ampere != null && (
            <span className="text-xs leading-none">{module.ampere}A</span>
          )}
          {module.label && (
            <span className="text-[10px] leading-none truncate w-full text-center mt-0.5">
              {module.label}
            </span>
          )}
        </>
      )}
    </div>
  )
}
