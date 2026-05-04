import { useEffect, useState } from 'react'
import { t } from '../i18n/no'

const CABLE_TYPES = ['NYM-J', 'PFXP', 'PFSP', 'TFXP', 'XPK']
const CROSS_SECTIONS = ['1.5', '2.5', '4.0', '6.0', '10.0']

const empty = {
  designation: '',
  name: '',
  room: '',
  cable_type: '',
  cross_section: '',
  conductor_count: '',
  length_m: '',
  notes: '',
}

export default function CircuitDialog({ open, initial, onSave, onClose }) {
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              designation: initial.designation ?? '',
              name: initial.name ?? '',
              room: initial.room ?? '',
              cable_type: initial.cable_type ?? '',
              cross_section: initial.cross_section != null ? String(initial.cross_section) : '',
              conductor_count: initial.conductor_count != null ? String(initial.conductor_count) : '',
              length_m: initial.length_m != null ? String(initial.length_m) : '',
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

  const validate = () => {
    const errs = {}
    if (!form.designation.trim()) errs.designation = t.circuit.designationRequired
    if (!form.name.trim()) errs.name = t.circuit.nameRequired
    return errs
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    const payload = {
      designation: form.designation.trim(),
      name: form.name.trim(),
      room: form.room.trim() || null,
      cable_type: form.cable_type || null,
      cross_section: form.cross_section ? parseFloat(form.cross_section) : null,
      conductor_count: form.conductor_count ? parseInt(form.conductor_count, 10) : null,
      length_m: form.length_m ? parseFloat(form.length_m) : null,
      notes: form.notes.trim() || null,
    }
    onSave(payload)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          {initial ? t.circuit.edit : t.circuit.add}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.circuit.designation} *
            </label>
            <input
              type="text"
              value={form.designation}
              onChange={set('designation')}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.designation && (
              <p className="text-red-500 text-xs mt-1">{errors.designation}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.circuit.name} *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.name && (
              <p className="text-red-500 text-xs mt-1">{errors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.circuit.room}
            </label>
            <input
              type="text"
              value={form.room}
              onChange={set('room')}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.circuit.cableType}
              </label>
              <select
                value={form.cable_type}
                onChange={set('cable_type')}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">—</option>
                {CABLE_TYPES.map((ct) => (
                  <option key={ct} value={ct}>{ct}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.circuit.crossSection}
              </label>
              <select
                value={form.cross_section}
                onChange={set('cross_section')}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">—</option>
                {CROSS_SECTIONS.map((cs) => (
                  <option key={cs} value={cs}>{cs}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.circuit.conductorCount}
              </label>
              <input
                type="number"
                min="1"
                value={form.conductor_count}
                onChange={set('conductor_count')}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.circuit.lengthM}
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.length_m}
                onChange={set('length_m')}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.circuit.notes}
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
