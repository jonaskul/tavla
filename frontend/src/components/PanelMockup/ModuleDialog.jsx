import { useState, useEffect } from 'react'
import { t } from '../../i18n/no'
import { useModuleTypes } from '../../contexts/ModuleTypesContext'

const DEFAULT_WIDTHS = {
  breaker: 2,
  rcd: 2,
  rcd_breaker: 4,
  shelly: 1,
  dynalite: 1,
  surge_protection: 2,
  main_switch: 3,
  other: 1,
}

function getDefaultWidth(typeKey, types) {
  if (typeKey in DEFAULT_WIDTHS) return DEFAULT_WIDTHS[typeKey]
  const typeDef = types.find((t) => t.key === typeKey)
  if (!typeDef) return 1
  return typeDef.can_have_ampere ? 2 : 1
}

export default function ModuleDialog({
  open,
  module: existing,
  initialWidth = 1,
  circuits,
  onSave,
  onDelete,
  onClose,
}) {
  const { types } = useModuleTypes()

  const [form, setForm] = useState({
    type:       existing?.type       ?? '',
    ampere:     existing?.ampere     ?? '',
    label:      existing?.label      ?? '',
    circuit_id: existing?.circuit_id ?? '',
    has_rcd:    existing?.has_rcd    ?? false,
    is_vacant:  existing?.is_vacant  ?? false,
    width:      existing?.width      ?? initialWidth,
  })
  const [widthTouched, setWidthTouched] = useState(!!existing || initialWidth > 1)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (!open) return
    const handle = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [open, onClose])

  if (!open) return null

  const selectedType = types.find((t) => t.key === form.type)
  const showAmpere  = selectedType?.can_have_ampere ?? false
  const showCircuit = (selectedType?.can_have_circuit ?? false) && !form.is_vacant

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((er) => ({ ...er, [key]: undefined }))
  }

  const setCheck = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.checked }))
  }

  const handleTypeChange = (e) => {
    const newType = e.target.value
    setForm((f) => ({
      ...f,
      type: newType,
      width: widthTouched ? f.width : getDefaultWidth(newType, types),
    }))
    setErrors((er) => ({ ...er, type: undefined }))
  }

  const handleWidthChange = (e) => {
    setWidthTouched(true)
    setForm((f) => ({ ...f, width: e.target.value }))
    setErrors((er) => ({ ...er, width: undefined }))
  }

  const handleSave = () => {
    const newErrors = {}
    if (!form.type) newErrors.type = t.module.typeRequired
    if (Object.keys(newErrors).length) { setErrors(newErrors); return }

    onSave({
      type:       form.type,
      label:      form.label || null,
      ampere:     showAmpere && form.ampere !== '' ? Number(form.ampere) : null,
      has_rcd:    form.has_rcd,
      circuit_id: showCircuit && form.circuit_id !== '' ? Number(form.circuit_id) : null,
      is_vacant:  form.is_vacant,
      width:      Math.max(1, Number(form.width) || 1),
    })
  }

  const isEdit = !!existing

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">
          {isEdit ? t.panel.editModule : t.panel.addModule}
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
              onChange={handleTypeChange}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">— Velg type —</option>
              {types.map((mt) => (
                <option key={mt.key} value={mt.key}>{mt.name_no}</option>
              ))}
            </select>
            {errors.type && (
              <p className="text-red-500 text-xs mt-1">{errors.type}</p>
            )}
          </div>

          {/* Width */}
          <div>
            <label htmlFor="mod-width" className="block text-sm font-medium text-gray-700 mb-1">
              {t.module.width}
            </label>
            <input
              id="mod-width"
              data-testid="field-width"
              type="number"
              min="1"
              max="96"
              value={form.width}
              onChange={handleWidthChange}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">{t.module.widthHint}</p>
          </div>

          {/* Ampere */}
          {showAmpere && (
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

          {/* Label */}
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

          {/* Circuit */}
          {showCircuit && (
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
                    {c.designation} – {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Vacant */}
          <div className="flex items-center gap-2">
            <input
              id="mod-vacant"
              data-testid="field-is-vacant"
              type="checkbox"
              checked={form.is_vacant}
              onChange={setCheck('is_vacant')}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <label htmlFor="mod-vacant" className="text-sm text-gray-700">
              {t.module.isVacant}
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center">
          {isEdit && onDelete && (
            <button onClick={onDelete} className="text-sm text-red-600 hover:text-red-800">
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
