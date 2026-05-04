import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPanel, getCircuits, createCircuit, updateCircuit, deleteCircuit } from '../api/client'
import { t } from '../i18n/no'
import PanelCanvas from '../components/PanelMockup/PanelCanvas'
import CircuitDialog from '../components/CircuitDialog'

export default function PanelDetail() {
  const { id } = useParams()
  const panelId = Number(id)
  const qc = useQueryClient()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editCircuit, setEditCircuit] = useState(null)
  const [deleteError, setDeleteError] = useState(null)

  const { data: panel, isLoading, isError } = useQuery({
    queryKey: ['panel', panelId],
    queryFn: () => getPanel(panelId),
    retry: false,
  })

  const { data: circuits = [], isLoading: loadingCircuits } = useQuery({
    queryKey: ['circuits', panelId],
    queryFn: () => getCircuits(panelId),
    enabled: !!panel,
  })

  const createMutation = useMutation({
    mutationFn: (data) => createCircuit(panelId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['circuits', panelId] })
      setDialogOpen(false)
      setEditCircuit(null)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateCircuit(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['circuits', panelId] })
      setDialogOpen(false)
      setEditCircuit(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteCircuit(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['circuits', panelId] })
      setDeleteError(null)
    },
    onError: (err) => {
      const status = err.response?.status
      if (status === 409) {
        setDeleteError(t.circuit.cannotDeleteHasConnectionPoints)
      } else {
        setDeleteError(t.circuit.deleteError)
      }
    },
  })

  const openCreate = () => {
    setEditCircuit(null)
    setDialogOpen(true)
  }

  const openEdit = (circuit) => {
    setEditCircuit(circuit)
    setDialogOpen(true)
  }

  const handleSave = (payload) => {
    if (editCircuit) {
      updateMutation.mutate({ id: editCircuit.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  if (isLoading) return <p className="text-gray-500 text-sm">{t.common.loading}</p>
  if (isError || !panel)
    return <p className="text-red-500 text-sm">Sikringsskap ikke funnet.</p>

  return (
    <div>
      <div className="mb-5">
        <Link
          to={`/eiendommer/${panel.property_id}`}
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; {t.common.back}
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{panel.name}</h1>
        <p className="text-gray-500 text-sm mt-1">{panel.location}</p>
        <div className="mt-2 flex gap-4 text-sm text-gray-600">
          <span>
            <span className="font-medium">{t.panel.rows}:</span> {panel.rows}
          </span>
          <span>
            <span className="font-medium">{t.panel.modulesPerRow}:</span>{' '}
            {panel.modules_per_row}
          </span>
        </div>
        {panel.notes && (
          <p className="text-sm text-gray-500 mt-2 italic">{panel.notes}</p>
        )}
      </div>

      <div className="mb-6">
        <PanelCanvas panel={panel} />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-800">{t.nav.circuit}</h2>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          {t.circuit.add}
        </button>
      </div>

      {deleteError && (
        <p className="text-red-500 text-sm mb-3" data-testid="delete-circuit-error">
          {deleteError}
        </p>
      )}

      {loadingCircuits ? (
        <p className="text-gray-500 text-sm">{t.common.loading}</p>
      ) : circuits.length === 0 ? (
        <p className="text-gray-500 text-sm">{t.circuit.noCircuits}</p>
      ) : (
        <ul className="space-y-2">
          {circuits.map((circuit) => (
            <li
              key={circuit.id}
              className="bg-white border border-gray-200 rounded-lg px-5 py-3 shadow-sm flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <Link
                  to={`/kurs/${circuit.id}`}
                  className="font-medium text-blue-700 hover:underline"
                >
                  {circuit.designation} — {circuit.name}
                </Link>
                {circuit.room && (
                  <p className="text-sm text-gray-500 mt-0.5">{circuit.room}</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => openEdit(circuit)}
                  className="px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  {t.common.edit}
                </button>
                <button
                  onClick={() => {
                    setDeleteError(null)
                    deleteMutation.mutate(circuit.id)
                  }}
                  className="px-3 py-1 text-xs text-white bg-red-600 rounded-md hover:bg-red-700"
                >
                  {t.common.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CircuitDialog
        open={dialogOpen}
        initial={editCircuit}
        onSave={handleSave}
        onClose={() => { setDialogOpen(false); setEditCircuit(null) }}
      />
    </div>
  )
}
