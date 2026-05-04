import { useState } from 'react'
import { t } from '../../i18n/no'

const BREAKER_TYPES = new Set(['breaker', 'rcd', 'rcd_breaker'])

const ALL_TYPES = [
  'breaker', 'rcd', 'rcd_breaker', 'shelly', 'dynalite', 'surge_protection', 'other',
]

export default function ModuleDialog({
  mode,
  module: existing,
  circuits,
  onSave,
  onDelete,
  onClose,
}) {
  const [form, setForm] = useState({
    type:       existing?.type       ?? 'breaker',
    ampere:     existing?.ampere     ?? '',
    label:      existing?.label      ?? '',
    circuit_id: existing?.circuit_id ?? '',
    has_rcd:    existing?.has_rcd    ?? false,
  })

  const isBreaker = BREAKER_TYPES.has(form.type)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSave = () => {
    onSave({
      type:       form.type,
      label:      form.label || null,
      ampere:     isBreaker && form.ampere !== '' ? Number(form.ampere) : null,
      has_rcd:    form.has_rcd,
      circuit_id: isBreaker && form.circuit_id !== '' ? Number(form.circuit_id) : null,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">
          {mode === 'edit' ? t.panel.editModule : t.panel.addModule}
        </h2>

        <div className="space-y-4">
          {/* Type */}
          <div>
            <label htmlFor="mod-type" className="block text-sm font-medium text-gray-700 mb-1">
              {t.module.type}
            </label>
            <select
              id="mod-type"
              data-testid="field-type"
              value={form.type}
              onChange={set('type')}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              {ALL_TYPES.map((type) => (
                <option key={type} value={type}>{t.moduleType[type]}</option>
              ))}
            </select>
          </div>

          {/* Ampere — breaker types only */}
          {isBreaker && (
            <div>
              <label htmlFor="mod-ampere" className="block text-sm font-medium text-gray-700 mb-1">
                {t.module.ampere}
              </label>
              <input
                id="mod-ampere"
                data-testid="field-ampere"
                type="number"
                min="1"
                value={form.ampere}
                onChange={set('ampere')}
                placeholder="16"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
          )}

          {/* Label — always shown */}
          <div>
            <label htmlFor="mod-label" className="block text-sm font-medium text-gray-700 mb-1">
              {t.module.label}
            </label>
            <input
              id="mod-label"
              data-testid="field-label"
              type="text"
              value={form.label}
              onChange={set('label')}
              placeholder={t.module.label}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          {/* Circuit designation — breaker types only */}
          {isBreaker && (
            <div>
              <label htmlFor="mod-circuit" className="block text-sm font-medium text-gray-700 mb-1">
                {t.module.circuit}
              </label>
              <select
                id="mod-circuit"
                data-testid="field-circuit"
                value={form.circuit_id}
                onChange={set('circuit_id')}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">{t.module.noCircuit}</option>
                {circuits.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.designation} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center">
          {mode === 'edit' && (
            <button
              onClick={onDelete}
              className="text-sm text-red-600 hover:text-red-800"
            >
              {t.panel.deleteModule}
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {t.common.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
