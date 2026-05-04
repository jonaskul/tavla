import { useEffect, useState } from 'react'
import { t } from '../i18n/no'

const empty = { name: '', location: '', rows: 1, modules_per_row: 12, notes: '' }

export default function PanelDialog({ open, initial, onSave, onClose }) {
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              name: initial.name ?? '',
              location: initial.location ?? '',
              rows: initial.rows ?? 1,
              modules_per_row: initial.modules_per_row ?? 12,
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
  const setNum = (field) => (e) => setForm((f) => ({ ...f, [field]: Number(e.target.value) }))

  const handleSubmit = (e) => {
    e.preventDefault()
    const errs = {}
    if (!form.name.trim()) errs.name = t.panel.nameRequired
    if (!form.location.trim()) errs.location = t.panel.locationRequired
    if (Object.keys(errs).length) { setErrors(errs); return }
    onSave({
      name: form.name.trim(),
      location: form.location.trim(),
      rows: form.rows,
      modules_per_row: form.modules_per_row,
      notes: form.notes.trim() || null,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          {initial ? t.panel.edit : t.panel.add}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.panel.name} *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={set('name')}
                autoFocus
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.panel.location} *
              </label>
              <input
                type="text"
                value={form.location}
                onChange={set('location')}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.panel.rows}
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={form.rows}
                onChange={setNum('rows')}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.panel.modulesPerRow}
              </label>
              <input
                type="number"
                min="1"
                max="36"
                value={form.modules_per_row}
                onChange={setNum('modules_per_row')}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.panel.notes}
              </label>
              <textarea
                value={form.notes}
                onChange={set('notes')}
                rows={2}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
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
