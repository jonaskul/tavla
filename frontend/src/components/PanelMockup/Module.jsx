const TYPE_COLORS = {
  breaker:          'bg-blue-500 text-white',
  rcd:              'bg-yellow-400 text-gray-900',
  rcd_breaker:      'bg-green-500 text-white',
  shelly:           'bg-orange-500 text-white',
  dynalite:         'bg-purple-500 text-white',
  surge_protection: 'bg-red-500 text-white',
  main_switch:      'bg-gray-700 text-white',
  other:            'bg-gray-400 text-white',
}

const TYPE_ABBR = {
  breaker:          'B',
  rcd:              'JF',
  rcd_breaker:      'K',
  shelly:           'SH',
  dynalite:         'DY',
  surge_protection: 'OS',
  main_switch:      'OV',
  other:            'A',
}

// Each slot is 32px wide with 1px gap → pixel width = width * 33 - 1
const slotPx = (width) => width * 33 - 1

export default function Module({ module, onClick, onContextMenu }) {
  const isVacant = module.is_vacant

  const color = isVacant
    ? 'bg-gray-200 text-gray-400'
    : (TYPE_COLORS[module.type] ?? TYPE_COLORS.other)
  const abbr = isVacant ? null : (TYPE_ABBR[module.type] ?? '?')

  return (
    <div
      data-testid={`module-${module.id}`}
      className={`module-${module.type} ${isVacant ? 'module-vacant' : ''} h-16 rounded flex flex-col items-center justify-center cursor-pointer select-none px-1 shrink-0 ${color}`}
      style={{ width: slotPx(module.width) }}
      onClick={onClick}
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
