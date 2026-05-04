import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCircuit,
  getPanel,
  updateCircuit,
  deleteCircuit,
  getConnectionPoints,
  createConnectionPoint,
  updateConnectionPoint,
  deleteConnectionPoint,
} from '../api/client'
import { t } from '../i18n/no'
import CircuitDialog from '../components/CircuitDialog'
import ConnectionPointDialog from '../components/ConnectionPointDialog'
import FileUpload from '../components/FileUpload'
import ChangeLog from '../components/ChangeLog'
import ConfirmDialog from '../components/ConfirmDialog'
import EquipmentList from '../components/EquipmentList'

export default function CircuitDetail() {
  const { id } = useParams()
  const circuitId = Number(id)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [circuitDialog, setCircuitDialog] = useState(false)
  const [circuitDeleteConfirm, setCircuitDeleteConfirm] = useState({ open: false, error: null })
  const [cpDialog, setCpDialog] = useState({ open: false, item: null })
  const [cpDeleteConfirm, setCpDeleteConfirm] = useState({ open: false, item: null, error: null })
  const [openFiles, setOpenFiles] = useState({})

  const { data: circuit, isLoading, isError } = useQuery({
    queryKey: ['circuit', circuitId],
    queryFn: () => getCircuit(circuitId),
    retry: false,
  })

  const { data: panel } = useQuery({
    queryKey: ['panel', circuit?.panel_id],
    queryFn: () => getPanel(circuit.panel_id),
    enabled: !!circuit,
  })

  const { data: connectionPoints = [] } = useQuery({
    queryKey: ['connection_points', circuitId],
    queryFn: () => getConnectionPoints(circuitId),
    enabled: !!circuit,
  })

  const updateCircuitMutation = useMutation({
    mutationFn: (data) => updateCircuit(circuitId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['circuit', circuitId] })
      setCircuitDialog(false)
    },
  })

  const deleteCircuitMutation = useMutation({
    mutationFn: () => deleteCircuit(circuitId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['circuits', circuit?.panel_id] })
      navigate(`/skap/${circuit.panel_id}`)
    },
    onError: (err) => {
      const status = err.response?.status
      setCircuitDeleteConfirm((c) => ({
        ...c,
        error: status === 409 ? t.circuit.cannotDeleteHasConnectionPoints : t.circuit.deleteError,
      }))
    },
  })

  const createCpMutation = useMutation({
    mutationFn: (data) => createConnectionPoint(circuitId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connection_points', circuitId] })
      qc.invalidateQueries({ queryKey: ['changelog', circuitId] })
      setCpDialog({ open: false, item: null })
    },
  })

  const updateCpMutation = useMutation({
    mutationFn: ({ id, data }) => updateConnectionPoint(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connection_points', circuitId] })
      qc.invalidateQueries({ queryKey: ['changelog', circuitId] })
      setCpDialog({ open: false, item: null })
    },
  })

  const deleteCpMutation = useMutation({
    mutationFn: (cpId) => deleteConnectionPoint(cpId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connection_points', circuitId] })
      qc.invalidateQueries({ queryKey: ['changelog', circuitId] })
      setCpDeleteConfirm({ open: false, item: null, error: null })
    },
    onError: (err) => {
      const status = err.response?.status
      setCpDeleteConfirm((c) => ({
        ...c,
        error: status === 409 ? t.connectionPoint.cannotDeleteHasFiles : t.connectionPoint.deleteError,
      }))
    },
  })

  const handleSaveCp = (form) => {
    if (cpDialog.item) {
      updateCpMutation.mutate({ id: cpDialog.item.id, data: form })
    } else {
      createCpMutation.mutate(form)
    }
  }

  if (isLoading) return <p className="text-gray-500 text-sm">{t.common.loading}</p>
  if (isError || !circuit)
    return <p className="text-red-500 text-sm">Kurs ikke funnet.</p>

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-5 flex gap-4 text-sm">
        {panel && (
          <Link
            to={`/eiendommer/${panel.property_id}`}
            className="text-blue-600 hover:underline"
          >
            &larr; {t.property.title}
          </Link>
        )}
        <Link to={`/skap/${circuit.panel_id}`} className="text-blue-600 hover:underline">
          &larr; {t.common.back}
        </Link>
      </div>

      {/* Circuit header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {circuit.designation} — {circuit.name}
          </h1>
          {circuit.room && (
            <p className="text-gray-500 text-sm mt-1">{circuit.room}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setCircuitDialog(true)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {t.common.edit}
          </button>
          <button
            onClick={() => setCircuitDeleteConfirm({ open: true, error: null })}
            className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-md hover:bg-red-700"
          >
            {t.common.delete}
          </button>
        </div>
      </div>

      {/* Circuit details */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-8 bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        {circuit.cable_type && (
          <>
            <dt className="font-medium text-gray-600">{t.circuit.cableType}</dt>
            <dd className="text-gray-900">{circuit.cable_type}</dd>
          </>
        )}
        {circuit.cross_section != null && (
          <>
            <dt className="font-medium text-gray-600">{t.circuit.crossSection}</dt>
            <dd className="text-gray-900">{circuit.cross_section} mm²</dd>
          </>
        )}
        {circuit.conductor_count != null && (
          <>
            <dt className="font-medium text-gray-600">{t.circuit.conductorCount}</dt>
            <dd className="text-gray-900">{circuit.conductor_count}</dd>
          </>
        )}
        {circuit.length_m != null && (
          <>
            <dt className="font-medium text-gray-600">{t.circuit.lengthM}</dt>
            <dd className="text-gray-900">{circuit.length_m} m</dd>
          </>
        )}
        {circuit.notes && (
          <>
            <dt className="font-medium text-gray-600">{t.circuit.notes}</dt>
            <dd className="text-gray-900 italic">{circuit.notes}</dd>
          </>
        )}
      </dl>

      {/* Connection Points */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">
            {t.circuit.connectionPoints}
          </h2>
          <button
            onClick={() => setCpDialog({ open: true, item: null })}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700"
          >
            {t.connectionPoint.add}
          </button>
        </div>

        {connectionPoints.length === 0 ? (
          <p className="text-gray-500 text-sm">{t.connectionPoint.noConnectionPoints}</p>
        ) : (
          <ul className="space-y-3">
            {connectionPoints.map((cp) => (
              <li
                key={cp.id}
                className="bg-white border border-gray-200 rounded-lg shadow-sm"
              >
                <div className="px-5 py-3 flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-800">
                      {t.connectionPoint.types[cp.type]}
                    </p>
                    <p className="text-sm text-gray-600">{cp.location}</p>
                    {cp.notes && (
                      <p className="text-xs text-gray-400 italic mt-0.5">{cp.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2 text-sm shrink-0 ml-4">
                    <button
                      onClick={() => setCpDialog({ open: true, item: cp })}
                      className="px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      {t.common.edit}
                    </button>
                    <button
                      onClick={() => setCpDeleteConfirm({ open: true, item: cp, error: null })}
                      className="px-3 py-1 text-xs text-white bg-red-600 rounded-md hover:bg-red-700"
                    >
                      {t.common.delete}
                    </button>
                  </div>
                </div>

                {/* Files toggle */}
                <div className="px-5 pb-4 border-t border-gray-100 pt-2">
                  <button
                    className="text-xs text-gray-500 hover:text-gray-700 mb-2"
                    onClick={() =>
                      setOpenFiles((o) => ({ ...o, [cp.id]: !o[cp.id] }))
                    }
                  >
                    {openFiles[cp.id] ? '▲' : '▼'} {t.connectionPoint.files}
                  </button>
                  {openFiles[cp.id] && <FileUpload connectionPointId={cp.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Equipment */}
      <div className="mb-8">
        <EquipmentList circuitId={circuitId} />
      </div>

      {/* Changelog */}
      <ChangeLog circuitId={circuitId} />

      {/* Circuit dialogs */}
      <CircuitDialog
        open={circuitDialog}
        initial={circuit}
        onSave={(payload) => updateCircuitMutation.mutate(payload)}
        onClose={() => setCircuitDialog(false)}
      />

      <ConfirmDialog
        open={circuitDeleteConfirm.open}
        message={t.circuit.deleteConfirm}
        error={circuitDeleteConfirm.error}
        onConfirm={() => deleteCircuitMutation.mutate()}
        onClose={() => setCircuitDeleteConfirm({ open: false, error: null })}
      />

      {/* Connection Point dialogs */}
      <ConnectionPointDialog
        open={cpDialog.open}
        initial={cpDialog.item}
        onSave={handleSaveCp}
        onClose={() => setCpDialog({ open: false, item: null })}
      />

      <ConfirmDialog
        open={cpDeleteConfirm.open}
        message={t.common.confirmDelete}
        error={cpDeleteConfirm.error}
        onConfirm={() => deleteCpMutation.mutate(cpDeleteConfirm.item.id)}
        onClose={() => setCpDeleteConfirm({ open: false, item: null, error: null })}
      />
    </div>
  )
}
