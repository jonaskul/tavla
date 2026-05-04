import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPanel, updatePanel, deletePanel, getCircuits, createCircuit, updateCircuit, deleteCircuit, getEquipment } from '../api/client'
import { t } from '../i18n/no'
import PanelCanvas from '../components/PanelMockup/PanelCanvas'
import PanelDialog from '../components/PanelDialog'
import CircuitDialog from '../components/CircuitDialog'
import ConfirmDialog from '../components/ConfirmDialog'

export default function PanelDetail() {
  const { id } = useParams()
  const panelId = Number(id)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [panelDialog, setPanelDialog] = useState(false)
  const [panelDeleteConfirm, setPanelDeleteConfirm] = useState({ open: false, error: null })
  const [circuitDialog, setCircuitDialog] = useState({ open: false, item: null })
  const [circuitDeleteConfirm, setCircuitDeleteConfirm] = useState({ open: false, item: null, error: null })
  const [filterEquipment, setFilterEquipment] = useState(false)

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

  // Fetch equipment counts for all circuits in parallel
  const equipmentQueries = useQueries({
    queries: circuits.map((c) => ({
      queryKey: ['equipment', c.id],
      queryFn: () => getEquipment(c.id),
      enabled: circuits.length > 0,
    })),
  })

  // Map circuit.id → equipment count
  const equipmentCountMap = Object.fromEntries(
    circuits.map((c, i) => [c.id, equipmentQueries[i]?.data?.length ?? 0])
  )

  const visibleCircuits = filterEquipment
    ? circuits.filter((c) => equipmentCountMap[c.id] > 0)
    : circuits

  const updatePanelMutation = useMutation({
    mutationFn: (data) => updatePanel(panelId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['panel', panelId] })
      setPanelDialog(false)
    },
  })

  const deletePanelMutation = useMutation({
    mutationFn: () => deletePanel(panelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['panels', panel?.property_id] })
      navigate(`/eiendommer/${panel.property_id}`)
    },
    onError: (err) => {
      const status = err.response?.status
      setPanelDeleteConfirm((c) => ({
        ...c,
        error: status === 409 ? t.panel.cannotDeleteHasCircuits : t.panel.deleteError,
      }))
    },
  })

  const createCircuitMutation = useMutation({
    mutationFn: (data) => createCircuit(panelId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['circuits', panelId] })
      setCircuitDialog({ open: false, item: null })
    },
  })

  const updateCircuitMutation = useMutation({
    mutationFn: ({ id, data }) => updateCircuit(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['circuits', panelId] })
      setCircuitDialog({ open: false, item: null })
    },
  })

  const deleteCircuitMutation = useMutation({
    mutationFn: (id) => deleteCircuit(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['circuits', panelId] })
      setCircuitDeleteConfirm({ open: false, item: null, error: null })
    },
    onError: (err) => {
      const status = err.response?.status
      setCircuitDeleteConfirm((c) => ({
        ...c,
        error: status === 409 ? t.circuit.cannotDeleteHasConnectionPoints : t.circuit.deleteError,
      }))
    },
  })

  const handleCircuitSave = (payload) => {
    if (circuitDialog.item) {
      updateCircuitMutation.mutate({ id: circuitDialog.item.id, data: payload })
    } else {
      createCircuitMutation.mutate(payload)
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

      {/* Panel header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
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
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setPanelDialog(true)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {t.common.edit}
          </button>
          <button
            onClick={() => setPanelDeleteConfirm({ open: true, error: null })}
            className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-md hover:bg-red-700"
          >
            {t.common.delete}
          </button>
        </div>
      </div>

      <div className="mb-6">
        <PanelCanvas panel={panel} />
      </div>

      {/* Circuits section */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-800">{t.nav.circuit}</h2>
          {circuits.some((c) => equipmentCountMap[c.id] > 0) && (
            <button
              onClick={() => setFilterEquipment((f) => !f)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                filterEquipment
                  ? 'bg-amber-100 border-amber-400 text-amber-800'
                  : 'border-gray-300 text-gray-500 hover:border-amber-400 hover:text-amber-700'
              }`}
              title={filterEquipment ? 'Vis alle kurser' : 'Vis kun kurser med utstyr'}
            >
              {t.equipment.title}
            </button>
          )}
        </div>
        <button
          onClick={() => setCircuitDialog({ open: true, item: null })}
          className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          {t.circuit.add}
        </button>
      </div>

      {loadingCircuits ? (
        <p className="text-gray-500 text-sm">{t.common.loading}</p>
      ) : visibleCircuits.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {filterEquipment ? 'Ingen kurser med fastmontert utstyr.' : t.circuit.noCircuits}
        </p>
      ) : (
        <ul className="space-y-2">
          {visibleCircuits.map((circuit) => {
            const eqCount = equipmentCountMap[circuit.id] ?? 0
            return (
              <li
                key={circuit.id}
                className="bg-white border border-gray-200 rounded-lg px-5 py-3 shadow-sm flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <div>
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
                  {eqCount > 0 && (
                    <button
                      onClick={() => setFilterEquipment((f) => !f)}
                      className="shrink-0 text-xs bg-amber-100 text-amber-800 border border-amber-300 rounded-full px-2 py-0.5 hover:bg-amber-200"
                      title={filterEquipment ? 'Vis alle kurser' : 'Filtrer på utstyr'}
                    >
                      {eqCount} {t.equipment.equipmentCount}
                    </button>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setCircuitDialog({ open: true, item: circuit })}
                    className="px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    {t.common.edit}
                  </button>
                  <button
                    onClick={() => setCircuitDeleteConfirm({ open: true, item: circuit, error: null })}
                    className="px-3 py-1 text-xs text-white bg-red-600 rounded-md hover:bg-red-700"
                  >
                    {t.common.delete}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Panel dialogs */}
      <PanelDialog
        open={panelDialog}
        initial={panel}
        onSave={(payload) => updatePanelMutation.mutate(payload)}
        onClose={() => setPanelDialog(false)}
      />

      <ConfirmDialog
        open={panelDeleteConfirm.open}
        message={t.panel.deleteConfirm}
        error={panelDeleteConfirm.error}
        onConfirm={() => deletePanelMutation.mutate()}
        onClose={() => setPanelDeleteConfirm({ open: false, error: null })}
      />

      {/* Circuit dialogs */}
      <CircuitDialog
        open={circuitDialog.open}
        initial={circuitDialog.item}
        onSave={handleCircuitSave}
        onClose={() => setCircuitDialog({ open: false, item: null })}
      />

      <ConfirmDialog
        open={circuitDeleteConfirm.open}
        message={t.circuit.deleteConfirm}
        error={circuitDeleteConfirm.error}
        onConfirm={() => deleteCircuitMutation.mutate(circuitDeleteConfirm.item.id)}
        onClose={() => setCircuitDeleteConfirm({ open: false, item: null, error: null })}
      />
    </div>
  )
}
