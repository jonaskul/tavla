import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getChangelog, createChangelogEntry } from '../api/client'
import { t } from '../i18n/no'

export default function ChangeLog({ circuitId }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ changed_by: '', description: '' })
  const [errors, setErrors] = useState({})
  const qc = useQueryClient()

  const { data: entries = [] } = useQuery({
    queryKey: ['changelog', circuitId],
    queryFn: () => getChangelog({ circuit_id: circuitId }),
  })

  const sorted = [...entries].sort(
    (a, b) => new Date(b.changed_at) - new Date(a.changed_at)
  )

  const mutation = useMutation({
    mutationFn: (data) => createChangelogEntry(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['changelog', circuitId] })
      setForm({ changed_by: '', description: '' })
      setErrors({})
      setShowForm(false)
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    const newErrors = {}
    if (!form.changed_by.trim()) newErrors.changed_by = t.changelog.changedByRequired
    if (!form.description.trim()) newErrors.description = t.changelog.descriptionRequired
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }
    mutation.mutate({ circuit_id: circuitId, ...form })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-800">{t.changelog.title}</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700"
        >
          {t.changelog.add}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 space-y-3"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.changelog.changedBy}
            </label>
            <input
              type="text"
              value={form.changed_by}
              onChange={(e) => setForm((f) => ({ ...f, changed_by: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            {errors.changed_by && (
              <p className="text-red-500 text-xs mt-1">{errors.changed_by}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.changelog.description}
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            {errors.description && (
              <p className="text-red-500 text-xs mt-1">{errors.description}</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              {t.common.save}
            </button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <p className="text-gray-500 text-sm">{t.changelog.noEntries}</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((entry) => (
            <li
              key={entry.id}
              className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm shadow-sm"
            >
              <div className="flex justify-between mb-1">
                <span className="font-medium text-gray-700">{entry.changed_by}</span>
                <span className="text-gray-400 text-xs">
                  {new Date(entry.changed_at).toLocaleString('nb-NO')}
                </span>
              </div>
              <p className="text-gray-600">{entry.description}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
