import { useState, useEffect } from 'react'
import { t } from '../i18n/no'

const CP_TYPES = Object.keys(t.connectionPoint.types)

export default function ConnectionPointDialog({ open, initial, onSave, onClose }) {
  const [form, setForm] = useState({ type: '', location: '', notes: '' })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? { type: initial.type, location: initial.location, notes: initial.notes || '' }
          : { type: '', location: '', notes: '' }
      )
      setErrors({})
    }
  }, [open, initial])

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    const newErrors = {}
    if (!form.type) newErrors.type = t.connectionPoint.typeRequired
    if (!form.location.trim()) newErrors.location = t.connectionPoint.locationRequired
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }
    onSave(form)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-900">
          {initial ? t.connectionPoint.edit : t.connectionPoint.add}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.connectionPoint.type}
            </label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Velg type —</option>
              {CP_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t.connectionPoint.types[type]}
                </option>
              ))}
            </select>
            {errors.type && (
              <p className="text-red-500 text-xs mt-1">{errors.type}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.connectionPoint.location}
            </label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.location && (
              <p className="text-red-500 text-xs mt-1">{errors.location}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.connectionPoint.notes}
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
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
