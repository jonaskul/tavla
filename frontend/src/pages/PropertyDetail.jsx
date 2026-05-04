import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProperty } from '../api/properties'
import { getPanels, createPanel, deletePanel } from '../api/panels'
import { t } from '../i18n/no'

const emptyForm = { name: '', location: '', rows: 1, modules_per_row: 12, notes: '' }

export default function PropertyDetail() {
  const { id } = useParams()
  const propertyId = Number(id)
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const { data: property, isLoading: loadingProp } = useQuery({
    queryKey: ['property', propertyId],
    queryFn: () => getProperty(propertyId),
  })

  const { data: panels = [], isLoading: loadingPanels } = useQuery({
    queryKey: ['panels', propertyId],
    queryFn: () => getPanels(propertyId),
  })

  const createMutation = useMutation({
    mutationFn: (data) => createPanel({ ...data, property_id: propertyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panels', propertyId] })
      setShowForm(false)
      setForm(emptyForm)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deletePanel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['panels', propertyId] }),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    createMutation.mutate(form)
  }

  const handleDelete = (panel) => {
    if (window.confirm(t.common.confirmDelete)) {
      deleteMutation.mutate(panel.id)
    }
  }

  if (loadingProp) return <p className="text-gray-500 text-sm">{t.common.loading}</p>
  if (!property)
    return <p className="text-red-500 text-sm">Eiendom ikke funnet.</p>

  return (
    <div>
      <div className="mb-5">
        <Link to="/" className="text-sm text-blue-600 hover:underline">
          &larr; {t.nav.properties}
        </Link>
      </div>

      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900">{property.name}</h1>
        <p className="text-gray-500 text-sm mt-1">{property.address}</p>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">{t.property.panels}</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
        >
          {t.panel.add}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-gray-200 rounded-lg p-5 mb-5 shadow-sm"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.panel.name}
              </label>
              <input
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.panel.location}
              </label>
              <input
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.panel.rows}
              </label>
              <input
                type="number"
                min="1"
                max="10"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.rows}
                onChange={(e) =>
                  setForm((f) => ({ ...f, rows: Number(e.target.value) }))
                }
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
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.modules_per_row}
                onChange={(e) =>
                  setForm((f) => ({ ...f, modules_per_row: Number(e.target.value) }))
                }
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.panel.notes}
              </label>
              <textarea
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {t.common.save}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setForm(emptyForm)
              }}
              className="border border-gray-300 px-4 py-2 rounded-md text-sm hover:bg-gray-50 transition-colors"
            >
              {t.common.cancel}
            </button>
          </div>
        </form>
      )}

      {loadingPanels ? (
        <p className="text-gray-500 text-sm">{t.common.loading}</p>
      ) : panels.length === 0 ? (
        <p className="text-gray-500 text-sm">Ingen sikringsskap registrert enda.</p>
      ) : (
        <ul className="space-y-2">
          {panels.map((panel) => (
            <li
              key={panel.id}
              className="bg-white border border-gray-200 rounded-lg px-5 py-4 flex items-center justify-between shadow-sm"
            >
              <div>
                <Link
                  to={`/skap/${panel.id}`}
                  className="font-medium text-blue-700 hover:underline"
                >
                  {panel.name}
                </Link>
                <p className="text-sm text-gray-500 mt-0.5">
                  {panel.location} &mdash; {panel.rows}{' '}
                  {t.panel.rows.toLowerCase()}, {panel.modules_per_row}{' '}
                  {t.panel.modulesPerRow.toLowerCase()}
                </p>
              </div>
              <button
                onClick={() => handleDelete(panel)}
                className="text-sm text-red-500 hover:text-red-700 ml-4"
              >
                {t.common.delete}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
