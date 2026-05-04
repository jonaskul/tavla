import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProperties, createProperty, updateProperty, deleteProperty } from '../api/client'
import { t } from '../i18n/no'
import PropertyDialog from '../components/PropertyDialog'
import ConfirmDialog from '../components/ConfirmDialog'

export default function Properties() {
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState({ open: false, item: null })
  const [confirm, setConfirm] = useState({ open: false, item: null, error: null })

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['properties'],
    queryFn: getProperties,
  })

  const createMutation = useMutation({
    mutationFn: createProperty,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      setDialog({ open: false, item: null })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateProperty(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      setDialog({ open: false, item: null })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteProperty(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      setConfirm({ open: false, item: null, error: null })
    },
    onError: (err) => {
      const status = err.response?.status
      setConfirm((c) => ({
        ...c,
        error: status === 409 ? t.property.cannotDeleteHasPanels : t.property.deleteError,
      }))
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t.property.title}</h1>
        <button
          onClick={() => setDialog({ open: true, item: null })}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
        >
          {t.property.add}
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">{t.common.loading}</p>
      ) : properties.length === 0 ? (
        <p className="text-gray-500 text-sm">{t.property.noProperties}</p>
      ) : (
        <ul className="space-y-2">
          {properties.map((prop) => (
            <li
              key={prop.id}
              className="bg-white border border-gray-200 rounded-lg px-5 py-4 flex items-center justify-between shadow-sm"
            >
              <div>
                <Link
                  to={`/eiendommer/${prop.id}`}
                  className="font-medium text-blue-700 hover:underline"
                >
                  {prop.name}
                </Link>
                <p className="text-sm text-gray-500 mt-0.5">{prop.address}</p>
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                <button
                  onClick={() => setDialog({ open: true, item: prop })}
                  className="px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  {t.common.edit}
                </button>
                <button
                  onClick={() => setConfirm({ open: true, item: prop, error: null })}
                  className="px-3 py-1 text-xs text-white bg-red-600 rounded-md hover:bg-red-700"
                >
                  {t.common.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PropertyDialog
        open={dialog.open}
        initial={dialog.item}
        onSave={handleSave}
        onClose={() => setDialog({ open: false, item: null })}
      />

      <ConfirmDialog
        open={confirm.open}
        message={t.property.deleteConfirm}
        error={confirm.error}
        onConfirm={() => deleteMutation.mutate(confirm.item.id)}
        onClose={() => setConfirm({ open: false, item: null, error: null })}
      />
    </div>
  )
}
