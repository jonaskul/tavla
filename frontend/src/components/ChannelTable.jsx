import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getChannels, createChannel, updateChannel, deleteChannel, getCircuits } from '../api/client'
import { t } from '../i18n/no'
import ConfirmDialog from './ConfirmDialog'

export default function ChannelTable({ equipmentId, panelId }) {
  const qc = useQueryClient()
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, item: null })

  const { data: channels = [] } = useQuery({
    queryKey: ['channels', equipmentId],
    queryFn: () => getChannels(equipmentId),
  })

  const { data: circuits = [] } = useQuery({
    queryKey: ['circuits', panelId],
    queryFn: () => getCircuits(panelId),
    enabled: !!panelId,
  })

  const createMutation = useMutation({
    mutationFn: (data) => createChannel(equipmentId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels', equipmentId] }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateChannel(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels', equipmentId] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteChannel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels', equipmentId] })
      setDeleteConfirm({ open: false, item: null })
    },
  })

  const startEdit = (ch) => {
    setEditingId(ch.id)
    setEditForm({
      label:        ch.label ?? '',
      load:         ch.load ?? '',
      circuit_id:   ch.circuit_id != null ? String(ch.circuit_id) : '',
      notes:        ch.notes ?? '',
      channel_type: ch.channel_type ?? 'relay',
      watt:         ch.watt != null ? String(ch.watt) : '',
    })
  }

  const saveEdit = (id) => {
    updateMutation.mutate({
      id,
      data: {
        label:        editForm.label.trim() || null,
        load:         editForm.load.trim() || null,
        circuit_id:   editForm.circuit_id ? parseInt(editForm.circuit_id, 10) : null,
        notes:        editForm.notes.trim() || null,
        channel_type: editForm.channel_type,
        watt:         editForm.watt !== '' ? parseInt(editForm.watt, 10) : null,
      },
    })
  }

  const handleKeyDown = (e, id) => {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(id) }
    if (e.key === 'Escape') setEditingId(null)
  }

  const addChannel = () => {
    const nextNumber = channels.length > 0
      ? Math.max(...channels.map((c) => c.number)) + 1
      : 1
    createMutation.mutate({ number: nextNumber })
  }

  const setEdit = (field) => (e) =>
    setEditForm((f) => ({ ...f, [field]: e.target.value }))

  const totalWatt = channels.reduce((sum, ch) => sum + (ch.watt ?? 0), 0)

  return (
    <div className="border-t border-gray-100 pt-3 mt-1">
      <div className="flex items-center justify-between mb-2 px-5">
        <span className="text-xs font-medium text-gray-600">{t.channel.title}</span>
        <button
          onClick={addChannel}
          className="text-xs text-blue-600 hover:text-blue-700"
        >
          + {t.channel.add}
        </button>
      </div>

      {channels.length > 0 && (
        <div className="overflow-x-auto px-5 pb-3">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="text-left pb-1.5 pr-3 font-medium w-8">{t.channel.number}</th>
                <th className="text-left pb-1.5 pr-3 font-medium min-w-[90px]">{t.channel.label}</th>
                <th className="text-left pb-1.5 pr-3 font-medium min-w-[90px]">{t.channel.load}</th>
                <th className="text-left pb-1.5 pr-3 font-medium min-w-[110px]">{t.channel.circuit}</th>
                <th className="text-left pb-1.5 pr-3 font-medium min-w-[80px]">{t.channel.channelType}</th>
                <th className="text-left pb-1.5 pr-3 font-medium w-14">{t.channel.wattCol}</th>
                <th className="text-left pb-1.5 pr-3 font-medium min-w-[80px]">{t.channel.notes}</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {channels.map((ch) => {
                const isEmpty = !ch.label && !ch.load && ch.circuit_id == null && !ch.notes
                const linkedCircuit = circuits.find((c) => c.id === ch.circuit_id)
                const isEditing = editingId === ch.id

                return (
                  <tr
                    key={ch.id}
                    data-testid="channel-row"
                    className={`border-b border-gray-50 ${isEmpty ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    <td className="py-1.5 pr-3 text-gray-400 shrink-0">{ch.number}</td>

                    {isEditing ? (
                      <>
                        <td className="py-1 pr-2">
                          <input
                            autoFocus
                            className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                            value={editForm.label}
                            onChange={setEdit('label')}
                            onKeyDown={(e) => handleKeyDown(e, ch.id)}
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                            value={editForm.load}
                            onChange={setEdit('load')}
                            onKeyDown={(e) => handleKeyDown(e, ch.id)}
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <select
                            className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                            value={editForm.circuit_id}
                            onChange={setEdit('circuit_id')}
                          >
                            <option value="">—</option>
                            {circuits.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.designation} {c.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1 pr-2">
                          <select
                            className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                            value={editForm.channel_type}
                            onChange={setEdit('channel_type')}
                          >
                            <option value="relay">{t.channel.relay}</option>
                            <option value="dimmer">{t.channel.dimmer}</option>
                          </select>
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            type="number"
                            min="0"
                            className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                            value={editForm.watt}
                            onChange={setEdit('watt')}
                            onKeyDown={(e) => handleKeyDown(e, ch.id)}
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                            value={editForm.notes}
                            onChange={setEdit('notes')}
                            onKeyDown={(e) => handleKeyDown(e, ch.id)}
                          />
                        </td>
                        <td className="py-1 flex gap-1 justify-end">
                          <button
                            onClick={() => saveEdit(ch.id)}
                            className="text-blue-600 hover:text-blue-700 px-1"
                          >
                            {t.common.save}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-gray-400 hover:text-gray-600 px-1"
                          >
                            {t.common.cancel}
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-1.5 pr-3">
                          {isEmpty
                            ? <span className="italic">{t.channel.noCircuit}</span>
                            : (ch.label || <span className="text-gray-300">—</span>)
                          }
                        </td>
                        <td className="py-1.5 pr-3">
                          {isEmpty
                            ? <span className="italic">{t.channel.noCircuit}</span>
                            : (ch.load || <span className="text-gray-300">—</span>)
                          }
                        </td>
                        <td className="py-1.5 pr-3">
                          {linkedCircuit
                            ? (
                              <Link
                                to={`/kurs/${ch.circuit_id}`}
                                className="text-blue-600 hover:underline"
                              >
                                {linkedCircuit.designation}
                              </Link>
                            )
                            : <span className="text-gray-300 italic">{t.channel.noCircuit}</span>
                          }
                        </td>
                        <td className="py-1.5 pr-3 text-gray-600">
                          {ch.channel_type === 'dimmer' ? t.channel.dimmer : t.channel.relay}
                        </td>
                        <td className="py-1.5 pr-3 text-gray-600">
                          {ch.watt != null ? `${ch.watt} W` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-1.5 pr-3">
                          {ch.notes || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-1 flex gap-1 justify-end">
                          <button
                            onClick={() => startEdit(ch)}
                            className="text-gray-400 hover:text-gray-700 px-1"
                          >
                            {t.common.edit}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ open: true, item: ch })}
                            className="text-red-400 hover:text-red-600 px-1"
                          >
                            {t.common.delete}
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>

          {totalWatt > 0 && (
            <p className="text-xs text-gray-500 mt-2 text-right">
              {t.channel.totalWatt}: <span className="font-medium">{totalWatt} W</span>
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm.open}
        message={t.channel.deleteConfirm}
        onConfirm={() => deleteMutation.mutate(deleteConfirm.item.id)}
        onClose={() => setDeleteConfirm({ open: false, item: null })}
      />
    </div>
  )
}
