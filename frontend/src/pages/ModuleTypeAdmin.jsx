import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getModuleTypes,
  createModuleType,
  updateModuleType,
  deleteModuleType,
} from '../api/client'
import { t } from '../i18n/no'
import ConfirmDialog from '../components/ConfirmDialog'

const s = t.settings.moduleTypes

const COLOR_PALETTE = [
  '#1d4ed8', '#2563eb', '#0ea5e9', '#06b6d4',
  '#14b8a6', '#16a34a', '#65a30d', '#ca8a04',
  '#d97706', '#f97316', '#ea580c', '#dc2626',
  '#b91c1c', '#9333ea', '#7c3aed', '#c026d3',
  '#db2777', '#374151', '#6b7280', '#111827',
]

function hexTextColor(hex) {
  if (!hex || hex.length < 7) return '#ffffff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#111827' : '#ffffff'
}

function Toggle({ checked, onChange, label, id }) {
  return (
    <label htmlFor={id} className="flex items-center gap-3 cursor-pointer select-none">
      <div
        id={id}
        role="switch"
        aria-checked={checked}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}
        onClick={() => onChange(!checked)}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  )
}

function ColorPicker({ value, onChange }) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">{s.color}</p>
      <div className="grid grid-cols-10 gap-1.5">
        {COLOR_PALETTE.map((hex) => {
          const selected = value === hex
          return (
            <button
              key={hex}
              type="button"
              title={hex}
              data-testid="color-swatch"
              aria-selected={selected ? 'true' : 'false'}
              onClick={() => onChange(hex)}
              className="w-7 h-7 rounded flex items-center justify-center"
              style={{ backgroundColor: hex }}
            >
              {selected && (
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3.5 3.5L13 5" stroke={hexTextColor(hex)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          )
        })}
      </div>
      {value && !COLOR_PALETTE.includes(value) && (
        <p className="text-xs text-gray-500 mt-1">Gjeldende: {value}</p>
      )}
    </div>
  )
}

function TypeDialog({ open, initial, onSave, onClose }) {
  const isEdit = !!initial
  const [form, setForm] = useState(() => ({
    key: initial?.key ?? '',
    name_no: initial?.name_no ?? '',
    color: initial?.color ?? COLOR_PALETTE[0],
    abbreviation: initial?.abbreviation ?? '',
    can_have_circuit: initial?.can_have_circuit ?? false,
    can_have_ampere: initial?.can_have_ampere ?? false,
  }))
  const [errors, setErrors] = useState({})

  if (!open) return null

  const set = (key) => (val) => {
    const value = typeof val === 'object' && val?.target ? val.target.value : val
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const handleSave = () => {
    const errs = {}
    if (!isEdit && !form.key.trim()) errs.key = s.keyRequired
    if (!form.name_no.trim()) errs.name_no = s.nameRequired
    if (!form.color) errs.color = s.colorRequired
    if (!form.abbreviation.trim()) errs.abbreviation = s.abbreviationRequired
    else if (form.abbreviation.trim().length > 3) errs.abbreviation = s.abbreviationTooLong
    if (Object.keys(errs).length) { setErrors(errs); return }

    const payload = {
      name_no: form.name_no.trim(),
      color: form.color,
      abbreviation: form.abbreviation.trim(),
      can_have_circuit: form.can_have_circuit,
      can_have_ampere: form.can_have_ampere,
    }
    if (!isEdit) payload.key = form.key.trim().toLowerCase().replace(/\s+/g, '_')
    onSave(payload)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-5">
          {isEdit ? s.edit : s.add}
        </h2>

        <div className="space-y-4">
          {!isEdit && (
            <div>
              <label htmlFor="type-key" className="block text-sm font-medium text-gray-700 mb-1">{s.key}</label>
              <input
                id="type-key"
                type="text"
                value={form.key}
                onChange={set('key')}
                placeholder="my_custom_type"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
              {errors.key
                ? <p className="text-red-500 text-xs mt-1">{errors.key}</p>
                : <p className="text-gray-400 text-xs mt-1">{s.keyHint}</p>
              }
            </div>
          )}

          <div>
            <label htmlFor="type-name" className="block text-sm font-medium text-gray-700 mb-1">{s.name}</label>
            <input
              id="type-name"
              type="text"
              value={form.name_no}
              onChange={set('name_no')}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
            {errors.name_no && <p className="text-red-500 text-xs mt-1">{errors.name_no}</p>}
          </div>

          <div>
            <label htmlFor="type-abbr" className="block text-sm font-medium text-gray-700 mb-1">{s.abbreviation}</label>
            <input
              id="type-abbr"
              type="text"
              value={form.abbreviation}
              onChange={set('abbreviation')}
              placeholder="LS"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
            {errors.abbreviation
              ? <p className="text-red-500 text-xs mt-1">{errors.abbreviation}</p>
              : <p className="text-gray-400 text-xs mt-1">{s.abbreviationHint}</p>
            }
          </div>

          <ColorPicker value={form.color} onChange={set('color')} />
          {errors.color && <p className="text-red-500 text-xs">{errors.color}</p>}

          {form.color && form.abbreviation && (
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-14 rounded flex items-center justify-center text-xs font-bold"
                style={{ backgroundColor: form.color, color: hexTextColor(form.color) }}
              >
                {form.abbreviation}
              </div>
              <span className="text-sm text-gray-500">Forhåndsvisning</span>
            </div>
          )}

          <div className="space-y-3 pt-1">
            <Toggle
              id="can_have_circuit"
              checked={form.can_have_circuit}
              onChange={set('can_have_circuit')}
              label={s.canHaveCircuit}
            />
            <Toggle
              id="can_have_ampere"
              checked={form.can_have_ampere}
              onChange={set('can_have_ampere')}
              label={s.canHaveAmpere}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
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
  )
}

export default function ModuleTypeAdmin() {
  const qc = useQueryClient()
  const [dialog, setDialog] = useState({ open: false, item: null })
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, item: null, error: null })

  const { data: types = [] } = useQuery({
    queryKey: ['module_types'],
    queryFn: getModuleTypes,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['module_types'] })

  const createMutation = useMutation({
    mutationFn: createModuleType,
    onSuccess: () => { invalidate(); setDialog({ open: false, item: null }) },
    onError: (err) => {
      if (err.response?.status === 400) {
        setDialog((d) => ({ ...d, error: s.keyExists }))
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateModuleType(id, data),
    onSuccess: () => { invalidate(); setDialog({ open: false, item: null }) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteModuleType(id),
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['modules'] })
      setDeleteConfirm({ open: false, item: null, error: null })
    },
    onError: (err) => {
      const msg = err.response?.status === 409 ? s.deleteBlocked : s.deleteError
      setDeleteConfirm((c) => ({ ...c, error: msg }))
    },
  })

  const handleSave = (payload) => {
    if (dialog.item) {
      updateMutation.mutate({ id: dialog.item.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setDialog({ open: true, item: null })}
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700"
        >
          {s.add}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600 w-14">{s.color}</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">{s.name}</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">{s.key}</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 hidden md:table-cell">{s.canHaveCircuit}</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 hidden md:table-cell">{s.canHaveAmpere}</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">{s.usage}</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {types.map((mt) => (
              <tr key={mt.id} data-testid="module-type-row">
                <td className="px-4 py-3">
                  <div
                    className="w-8 h-10 rounded flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: mt.color, color: hexTextColor(mt.color) }}
                  >
                    {mt.abbreviation}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{mt.name_no}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${mt.is_builtin ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-600'}`}>
                    {mt.is_builtin ? s.builtin : s.custom}
                  </span>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-gray-500 font-mono text-xs">{mt.key}</td>
                <td className="px-4 py-3 hidden md:table-cell">
                  {mt.can_have_circuit
                    ? <span className="text-green-600">✓</span>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  {mt.can_have_ampere
                    ? <span className="text-green-600">✓</span>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs ${mt.usage_count > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                    {mt.usage_count} {s.modules}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setDialog({ open: true, item: mt })}
                      className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                    >
                      {t.common.edit}
                    </button>
                    <button
                      data-testid="delete-btn"
                      onClick={() => setDeleteConfirm({ open: true, item: mt, error: null })}
                      disabled={mt.usage_count > 0}
                      title={mt.usage_count > 0 ? `${mt.usage_count} ${s.modules}` : undefined}
                      className="px-2.5 py-1 text-xs text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t.common.delete}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {types.length === 0 && (
          <p className="px-4 py-6 text-center text-gray-500 text-sm">{s.noTypes}</p>
        )}
      </div>

      <TypeDialog
        key={dialog.open ? (dialog.item?.id ?? 'new') : 'closed'}
        open={dialog.open}
        initial={dialog.item}
        onSave={handleSave}
        onClose={() => setDialog({ open: false, item: null })}
      />

      <ConfirmDialog
        open={deleteConfirm.open}
        message={s.deleteConfirm}
        error={deleteConfirm.error}
        onConfirm={() => deleteMutation.mutate(deleteConfirm.item.id)}
        onClose={() => setDeleteConfirm({ open: false, item: null, error: null })}
      />
    </div>
  )
}
