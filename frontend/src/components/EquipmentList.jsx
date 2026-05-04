import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getEquipment,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  getEquipmentFiles,
  uploadEquipmentFile,
} from '../api/client'
import { t } from '../i18n/no'
import EquipmentDialog from './EquipmentDialog'
import ConfirmDialog from './ConfirmDialog'
import FileUpload from './FileUpload'
import ChannelTable from './ChannelTable'

export default function EquipmentList({ circuitId, panelId }) {
  const qc = useQueryClient()

  const [dialog, setDialog] = useState({ open: false, item: null })
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, item: null, error: null })
  const [openFiles, setOpenFiles] = useState({})

  const { data: equipment = [] } = useQuery({
    queryKey: ['equipment', circuitId],
    queryFn: () => getEquipment(circuitId),
  })

  const createMutation = useMutation({
    mutationFn: (data) => createEquipment(circuitId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment', circuitId] })
      qc.invalidateQueries({ queryKey: ['changelog', circuitId] })
      setDialog({ open: false, item: null })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateEquipment(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment', circuitId] })
      setDialog({ open: false, item: null })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteEquipment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment', circuitId] })
      qc.invalidateQueries({ queryKey: ['changelog', circuitId] })
      setDeleteConfirm({ open: false, item: null, error: null })
    },
    onError: (err) => {
      const status = err.response?.status
      setDeleteConfirm((c) => ({
        ...c,
        error: status === 409 ? t.equipment.cannotDeleteHasFiles : t.equipment.deleteError,
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
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-800">{t.equipment.title}</h2>
        <button
          onClick={() => setDialog({ open: true, item: null })}
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700"
        >
          {t.equipment.add}
        </button>
      </div>

      {equipment.length === 0 ? (
        <p className="text-gray-500 text-sm">{t.equipment.noEquipment}</p>
      ) : (
        <ul className="space-y-3">
          {equipment.map((eq) => (
            <li key={eq.id} className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="px-5 py-3 flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-800">
                    {t.equipment.types[eq.type]}
                  </p>
                  {(eq.brand || eq.model) && (
                    <p className="text-sm text-gray-600">
                      {[eq.brand, eq.model].filter(Boolean).join(' ')}
                    </p>
                  )}
                  {eq.watt != null && (
                    <p className="text-xs text-gray-500">{eq.watt} W</p>
                  )}
                  {eq.notes && (
                    <p className="text-xs text-gray-400 italic mt-0.5">{eq.notes}</p>
                  )}
                </div>
                <div className="flex gap-2 text-sm shrink-0 ml-4">
                  <button
                    onClick={() => setDialog({ open: true, item: eq })}
                    className="px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    {t.common.edit}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ open: true, item: eq, error: null })}
                    className="px-3 py-1 text-xs text-white bg-red-600 rounded-md hover:bg-red-700"
                  >
                    {t.common.delete}
                  </button>
                </div>
              </div>

              {/* Channel register */}
              <ChannelTable equipmentId={eq.id} panelId={panelId} />

              {/* Files toggle */}
              <div className="px-5 pb-4 border-t border-gray-100 pt-2">
                <button
                  className="text-xs text-gray-500 hover:text-gray-700 mb-2"
                  onClick={() => setOpenFiles((o) => ({ ...o, [eq.id]: !o[eq.id] }))}
                >
                  {openFiles[eq.id] ? '▲' : '▼'} {t.equipment.files}
                </button>
                {openFiles[eq.id] && (
                  <FileUpload
                    queryKey={['equipment-files', eq.id]}
                    fetchFiles={() => getEquipmentFiles(eq.id)}
                    uploadFn={(f) => uploadEquipmentFile(eq.id, f)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <EquipmentDialog
        open={dialog.open}
        initial={dialog.item}
        onSave={handleSave}
        onClose={() => setDialog({ open: false, item: null })}
      />

      <ConfirmDialog
        open={deleteConfirm.open}
        message={t.equipment.deleteConfirm}
        error={deleteConfirm.error}
        onConfirm={() => deleteMutation.mutate(deleteConfirm.item.id)}
        onClose={() => setDeleteConfirm({ open: false, item: null, error: null })}
      />
    </div>
  )
}
