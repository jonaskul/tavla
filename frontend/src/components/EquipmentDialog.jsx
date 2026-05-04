import { useEffect, useState } from 'react'
import { t } from '../i18n/no'

const EQUIPMENT_TYPES = Object.keys(t.equipment.types)

const empty = { type: '', brand: '', model: '', watt: '', notes: '' }

export default function EquipmentDialog({ open, initial, onSave, onClose }) {
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              type: initial.type ?? '',
              brand: initial.brand ?? '',
              model: initial.model ?? '',
              watt: initial.watt != null ? String(initial.watt) : '',
              notes: initial.notes ?? '',
            }
          : empty
      )
      setErrors({})
    }
  }, [open, initial])

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    const errs = {}
    if (!form.type) errs.type = t.equipment.typeRequired
    if (Object.keys(errs).length) { setErrors(errs); return }
    onSave({
      type: form.type,
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      watt: form.watt ? parseInt(form.watt, 10) : null,
      notes: form.notes.trim() || null,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          {initial ? t.equipment.edit : t.equipment.add}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.equipment.type} *
            </label>
            <select
              value={form.type}
              onChange={set('type')}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Velg type —</option>
              {EQUIPMENT_TYPES.map((k) => (
                <option key={k} value={k}>{t.equipment.types[k]}</option>
              ))}
            </select>
            {errors.type && <p className="text-red-500 text-xs mt-1">{errors.type}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.equipment.brand}
              </label>
              <input
                type="text"
                value={form.brand}
                onChange={set('brand')}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.equipment.model}
              </label>
              <input
                type="text"
                value={form.model}
                onChange={set('model')}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.equipment.watt}
            </label>
            <input
              type="number"
              min="0"
              value={form.watt}
              onChange={set('watt')}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.equipment.notes}
            </label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={2}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              {t.common.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
