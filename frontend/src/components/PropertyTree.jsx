import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { exportProperty } from '../api/client'
import { t } from '../i18n/no'

const CP_ICONS = {
  junction_box: '📦',
  outlet: '🔌',
  light: '💡',
  switch: '🔘',
  motor: '⚙️',
  other: '📦',
}

function toggle(set, id) {
  const next = new Set(set)
  next.has(id) ? next.delete(id) : next.add(id)
  return next
}

function ChannelRow({ channel }) {
  const parts = []
  if (channel.label) parts.push(channel.label)
  if (channel.load) parts.push(channel.load)
  if (channel.watt != null) parts.push(`${channel.watt} W`)

  return (
    <div className="flex items-baseline gap-1.5 py-0.5 pl-10 text-xs text-gray-500">
      <span className="text-gray-300 shrink-0">→</span>
      <span className="text-gray-400 shrink-0">
        {t.property.treeChannel} {channel.number}
      </span>
      {parts.length > 0 && (
        <>
          <span className="text-gray-300">:</span>
          <span>{parts.join(' – ')}</span>
        </>
      )}
    </div>
  )
}

function CircuitChildren({ circuit }) {
  const hasChildren =
    circuit.connection_points.length > 0 || circuit.equipment.length > 0

  if (!hasChildren) return null

  return (
    <div className="pl-6 pb-1.5 border-l border-gray-100 ml-[1.375rem]">
      {circuit.connection_points.map((cp) => (
        <div key={cp.id} className="flex items-baseline gap-1.5 py-0.5 text-sm text-gray-700">
          <span className="shrink-0">{CP_ICONS[cp.type] ?? '📦'}</span>
          <span className="text-gray-500 shrink-0">{t.connectionPoint.types[cp.type]}</span>
          <span className="text-gray-300">–</span>
          <span className="text-gray-600">{cp.location}</span>
        </div>
      ))}
      {circuit.equipment.map((eq) => (
        <div key={eq.id}>
          <div className="flex items-baseline gap-1.5 py-0.5 text-sm text-gray-700">
            <span className="shrink-0">🔧</span>
            <span className="text-gray-500 shrink-0">{t.equipment.types[eq.type]}</span>
            {(eq.brand || eq.model) && (
              <>
                <span className="text-gray-300">–</span>
                <span className="text-gray-600">
                  {[eq.brand, eq.model].filter(Boolean).join(' ')}
                </span>
              </>
            )}
          </div>
          {eq.channels?.map((ch) => (
            <ChannelRow key={ch.id} channel={ch} />
          ))}
        </div>
      ))}
    </div>
  )
}

function CircuitRow({ circuit, collapsed, onToggle }) {
  const cpCount = circuit.connection_points.length
  const isEmpty =
    circuit.connection_points.length === 0 && circuit.equipment.length === 0

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-4 py-1.5 hover:bg-gray-50 text-left text-sm rounded transition-colors ${
          isEmpty ? 'cursor-default' : 'cursor-pointer'
        }`}
      >
        <span className="shrink-0 text-base">⚡</span>
        <Link
          to={`/kurs/${circuit.id}`}
          onClick={(e) => e.stopPropagation()}
          className={`font-mono text-xs shrink-0 ${
            isEmpty ? 'text-gray-400' : 'text-gray-500 hover:text-blue-600'
          }`}
        >
          {circuit.designation}
        </Link>
        <Link
          to={`/kurs/${circuit.id}`}
          onClick={(e) => e.stopPropagation()}
          className={`truncate ${
            isEmpty
              ? 'text-gray-400 italic'
              : 'text-gray-800 hover:text-blue-700 hover:underline'
          }`}
        >
          {circuit.name || t.property.treeEmptyCircuit}
        </Link>
        {cpCount > 0 && (
          <span className="shrink-0 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full leading-none">
            {cpCount}
          </span>
        )}
        {!isEmpty && (
          <span className="ml-auto shrink-0 text-gray-400 text-xs">
            {collapsed ? '▶' : '▼'}
          </span>
        )}
      </button>

      {!collapsed && <CircuitChildren circuit={circuit} />}
    </div>
  )
}

function PanelSection({ panel, collapsedCircuits, onToggleCircuit }) {
  return (
    <div className="divide-y divide-gray-50">
      {panel.circuits.length === 0 ? (
        <p className="px-4 py-3 text-sm text-gray-400 italic">
          {t.property.treeNoCircuits}
        </p>
      ) : (
        panel.circuits.map((circuit) => (
          <CircuitRow
            key={circuit.id}
            circuit={circuit}
            collapsed={collapsedCircuits.has(circuit.id)}
            onToggle={() => onToggleCircuit(circuit.id)}
          />
        ))
      )}
    </div>
  )
}

export default function PropertyTree({ propertyId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['property-tree', propertyId],
    queryFn: () => exportProperty(propertyId),
  })

  const [collapsedPanels, setCollapsedPanels] = useState(new Set())
  const [collapsedCircuits, setCollapsedCircuits] = useState(new Set())

  if (isLoading) return <p className="text-sm text-gray-500">{t.common.loading}</p>
  if (!data) return null

  if (data.panels.length === 0) {
    return <p className="text-sm text-gray-500">{t.property.treeNoPanels}</p>
  }

  const togglePanel = (id) => setCollapsedPanels((p) => toggle(p, id))
  const toggleCircuit = (id) => setCollapsedCircuits((p) => toggle(p, id))

  return (
    <div className="space-y-3">
      {data.panels.map((panel) => {
        const collapsed = collapsedPanels.has(panel.id)
        return (
          <div
            key={panel.id}
            className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm"
          >
            {/* Panel header */}
            <button
              type="button"
              onClick={() => togglePanel(panel.id)}
              className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 text-left transition-colors"
            >
              <span className="text-base shrink-0">🗄️</span>
              <Link
                to={`/skap/${panel.id}`}
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-blue-700 hover:underline text-sm"
              >
                {panel.name}
              </Link>
              <span className="text-gray-500 text-xs">({panel.location})</span>
              <span className="ml-auto text-gray-400 text-xs shrink-0">
                {collapsed ? '▶' : '▼'}
              </span>
            </button>

            {!collapsed && (
              <PanelSection
                panel={panel}
                collapsedCircuits={collapsedCircuits}
                onToggleCircuit={toggleCircuit}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
